/**
 * 일본 시장 인텔리전스 브리핑 생성 로직
 * route.ts에서 export하면 Next.js가 Route export로 오해하므로 별도 파일로 분리
 */

import OpenAI from 'openai'
import { MarketBriefTopic, CompetitorPR } from '@/types'

// ── 추적할 경쟁사 목록 (필요 시 추가) ────────────────────────
const TRACKED_COMPETITORS = [
  {
    brand: 'Numberzin (넘버즈인)',
    queries: (dateJP: string) => [
      `numberzin instagram 日本語 リール ${dateJP}`,
      `ナンバーズイン インスタグラム 新製品 PR ${dateJP}`,
    ],
  },
  {
    brand: '마녀공장 (Witch Factory)',
    queries: (dateJP: string) => [
      `마녀공장 witch factory instagram 日本語 リール ${dateJP}`,
      `ウィッチファクトリー インスタグラム PR 製品 ${dateJP}`,
    ],
  },
]

// ── Tavily 검색 ───────────────────────────────────────────────
interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
}

async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return []
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        include_answer: false,
        include_raw_content: false,
        max_results: 5,
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map((r: TavilyResult) => ({
      title: r.title,
      url: r.url,
      content: r.content?.slice(0, 600) ?? '',
      score: r.score ?? 0,
    }))
  } catch {
    return []
  }
}

// ── 메인 ─────────────────────────────────────────────────────
export async function generateDailyBrief(): Promise<{
  date: string
  searchDate: string
  summary: string
  topics: MarketBriefTopic[]
  competitorPR: CompetitorPR[]
  sources: { title: string; url: string }[]
}> {
  const today = new Date().toISOString().slice(0, 10)

  // 검색 기준: 어제 날짜
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const searchDate = yesterdayDate.toISOString().slice(0, 10)
  const [syYear, syMonth, syDay] = searchDate.split('-').map(Number)
  const dateJP = `${syYear}年${syMonth}月${syDay}日`   // 예: 2025年5月19日
  const dateKR = `${syMonth}월 ${syDay}일`             // 예: 5월 19일

  // ── 1. 시장 트렌드 검색 (날짜 기준 명시) ─────────────────────
  const trendQueries = [
    `${dateJP} 日本 SNS インフルエンサー マーケティング トレンド`,
    `${dateJP} 日本 Instagram TikTok バイラル 話題`,
    `Japan social media influencer trend ${searchDate}`,
    `${dateJP} 日本 美容 コスメ SNS バズ`,
    `${dateJP} 日本市場 韓国 コスメ インスタグラム`,
  ]

  const trendResultsRaw = await Promise.all(trendQueries.map(tavilySearch))
  const trendResults = trendResultsRaw
    .flat()
    .filter((r, i, arr) => arr.findIndex((x) => x.url === r.url) === i)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)

  // ── 2. 경쟁사 검색 ───────────────────────────────────────────
  const competitorRawMap: Record<string, TavilyResult[]> = {}

  await Promise.all(
    TRACKED_COMPETITORS.map(async (comp) => {
      const results = await Promise.all(comp.queries(dateJP).map(tavilySearch))
      competitorRawMap[comp.brand] = results
        .flat()
        .filter((r, i, arr) => arr.findIndex((x) => x.url === r.url) === i)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
    })
  )

  if (trendResults.length === 0) {
    return {
      date: today,
      searchDate,
      summary: '검색 결과를 가져올 수 없습니다. Tavily API 키를 확인하세요.',
      topics: [],
      competitorPR: [],
      sources: [],
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return {
      date: today,
      searchDate,
      summary: 'OpenAI API 키가 설정되지 않았습니다.',
      topics: [],
      competitorPR: [],
      sources: trendResults.slice(0, 5).map((r) => ({ title: r.title, url: r.url })),
    }
  }

  // ── 3. OpenAI 분석 ────────────────────────────────────────────
  const openai = new OpenAI({ apiKey: openaiKey })

  const trendContext = trendResults
    .map((r, i) => `[트렌드 ${i + 1}] ${r.title}\n${r.content}`)
    .join('\n\n')

  const competitorContext = TRACKED_COMPETITORS.map((comp) => {
    const results = competitorRawMap[comp.brand] ?? []
    if (results.length === 0) return `[경쟁사: ${comp.brand}]\n검색 결과 없음`
    return (
      `[경쟁사: ${comp.brand}]\n` +
      results.map((r, i) => `  (${i + 1}) ${r.title}\n  ${r.content}`).join('\n\n')
    )
  }).join('\n\n---\n\n')

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    max_completion_tokens: 1800,
    messages: [
      {
        role: 'system',
        content: `당신은 일본 디지털 마케팅 전문가입니다. ${dateKR}(${dateJP}) 기준 검색 결과를 분석하여 한국어로 브리핑을 작성하세요.

두 가지 분석을 수행하세요:
① 일본 SNS 트렌드 요약 (트렌드 검색 결과 기반)
② 경쟁사 인스타그램 PR 현황 (경쟁사 검색 결과 기반)
   - 검색 결과에서 일본어 인스타그램 릴스/피드로 홍보 중인 제품명을 추출
   - 각 제품이 검색 결과에서 몇 건 언급되었는지 집계
   - 검색 결과에서 확인되지 않으면 found: false

반드시 아래 JSON 형식으로만 응답하세요:
{
  "summary": "전체 트렌드 2-3문장 요약",
  "topics": [
    { "title": "주제명", "description": "2-3문장 설명", "source": "출처 제목(선택)" }
  ],
  "competitorPR": [
    {
      "brand": "브랜드명",
      "found": true,
      "summary": "해당 브랜드 활동 한줄 요약",
      "products": [
        { "name": "제품명", "count": 2, "note": "부가 설명(선택)" }
      ]
    }
  ]
}

topics는 3-5개, 실제 검색 결과에서 확인된 내용만 포함하세요.
competitorPR은 검색 대상 브랜드 전체를 포함하되, 발견 안 되면 found: false, products: []로 표기하세요.`,
      },
      {
        role: 'user',
        content: `=== ${dateKR} 일본 SNS 트렌드 검색 결과 ===\n\n${trendContext}\n\n=== 경쟁사 인스타그램 PR 검색 결과 ===\n\n${competitorContext}`,
      },
    ],
    response_format: { type: 'json_object' },
  })

  let parsed: { summary: string; topics: MarketBriefTopic[]; competitorPR: CompetitorPR[] } = {
    summary: '',
    topics: [],
    competitorPR: [],
  }
  try {
    parsed = JSON.parse(response.choices[0].message.content ?? '{}')
  } catch {
    parsed.summary = response.choices[0].message.content ?? ''
  }

  // 경쟁사 목록에 있는 브랜드가 응답에서 누락됐을 경우 기본값 보정
  const returnedBrands = new Set((parsed.competitorPR ?? []).map((c) => c.brand))
  for (const comp of TRACKED_COMPETITORS) {
    if (!returnedBrands.has(comp.brand)) {
      parsed.competitorPR = parsed.competitorPR ?? []
      parsed.competitorPR.push({
        brand: comp.brand,
        found: false,
        summary: '검색 결과에서 확인되지 않음',
        products: [],
      })
    }
  }

  return {
    date: today,
    searchDate,
    summary: parsed.summary || '요약 생성 실패',
    topics: parsed.topics || [],
    competitorPR: parsed.competitorPR || [],
    sources: trendResults.slice(0, 8).map((r) => ({ title: r.title, url: r.url })),
  }
}
