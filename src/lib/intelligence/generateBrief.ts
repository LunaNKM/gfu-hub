/**
 * 일본 시장 인텔리전스 브리핑 생성 로직
 * route.ts에서 export하면 Next.js가 Route export로 오해하므로 별도 파일로 분리
 */

import OpenAI from 'openai'
import { MarketBriefTopic, CompetitorPR } from '@/types'

// ── 추적할 경쟁사 목록 (필요 시 추가/수정) ───────────────────
const TRACKED_COMPETITORS = [
  {
    brand: '제리와 콩나무',
    queries: (dateJP: string) => [
      `"제리와 콩나무" 일본 마케팅 ${dateJP}`,
      `"제리와 콩나무" インフルエンサー マーケティング`,
      `Jerry beanstalk Japan marketing agency Korean`,
    ],
  },
  {
    brand: '챌린저스',
    queries: (dateJP: string) => [
      `"챌린저스" 일본 마케팅 에이전시 ${dateJP}`,
      `"챌린저스" インフルエンサー 日本`,
      `Challengers Korea Japan marketing agency`,
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

// days: Tavily에 "최근 N일 이내" 결과만 반환하도록 지시
// 트렌드 검색 → days=2 (어제 전체를 커버), 경쟁사 검색 → 제한 없음
async function tavilySearch(query: string, days?: number): Promise<TavilyResult[]> {
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
        ...(days !== undefined ? { days } : {}),
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
  const dateJP = `${syYear}年${syMonth}月${syDay}日`
  const dateKR = `${syMonth}월 ${syDay}일`

  // ── 1. 시장 트렌드 검색 (days=2: 어제 하루를 완전히 커버) ─────
  // days=2 → Tavily가 "최근 48시간" 이내 결과만 반환
  // 날짜를 따옴표로 감싸서 해당 날짜 명시 콘텐츠 우선 탐색
  const TREND_DAYS = 2
  const trendQueries = [
    `"${dateJP}" 日本 SNS インフルエンサー マーケティング`,
    `"${dateJP}" 日本 Instagram TikTok バイラル 話題`,
    `"${searchDate}" Japan social media influencer trend`,
    `"${dateJP}" 日本 美容 コスメ SNS バズ`,
    `"${dateJP}" 日本市場 韓国 コスメ インスタグラム`,
  ]

  const trendResultsRaw = await Promise.all(trendQueries.map((q) => tavilySearch(q, TREND_DAYS)))
  const trendResults = trendResultsRaw
    .flat()
    .filter((r, i, arr) => arr.findIndex((x) => x.url === r.url) === i)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)

  // ── 2. 경쟁사 언급/활동 검색 ─────────────────────────────────
  const competitorRawMap: Record<string, TavilyResult[]> = {}

  await Promise.all(
    TRACKED_COMPETITORS.map(async (comp) => {
      // 경쟁사는 날짜 제한 없이 검색 (최근 언급/활동 발견이 목적)
      const results = await Promise.all(comp.queries(dateJP).map((q) => tavilySearch(q)))
      // URL 중복 제거 후 score 순 정렬, 최대 6개
      competitorRawMap[comp.brand] = results
        .flat()
        .filter((r, i, arr) => arr.findIndex((x) => x.url === r.url) === i)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
    })
  )

  if (trendResults.length === 0) {
    return {
      date: today,
      searchDate,
      summary: '검색 결과를 가져올 수 없습니다. Tavily API 키를 확인하세요.',
      topics: [],
      competitorPR: TRACKED_COMPETITORS.map((c) => ({
        brand: c.brand,
        found: false,
        summary: '검색 결과 없음',
        links: [],
      })),
      sources: [],
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    // OpenAI 없어도 링크는 반환
    return {
      date: today,
      searchDate,
      summary: 'OpenAI API 키가 설정되지 않았습니다.',
      topics: [],
      competitorPR: TRACKED_COMPETITORS.map((c) => {
        const raw = competitorRawMap[c.brand] ?? []
        return {
          brand: c.brand,
          found: raw.length > 0,
          summary: raw.length > 0 ? '검색 결과 발견' : '검색 결과 없음',
          links: raw.map((r) => ({ title: r.title, url: r.url, snippet: r.content.slice(0, 150) })),
        }
      }),
      sources: trendResults.slice(0, 5).map((r) => ({ title: r.title, url: r.url })),
    }
  }

  // ── 3. OpenAI 분석 ────────────────────────────────────────────
  const openai = new OpenAI({ apiKey: openaiKey })

  const trendContext = trendResults
    .map((r, i) => `[트렌드 ${i + 1}] ${r.title}\n${r.content}`)
    .join('\n\n')

  // 경쟁사 컨텍스트 — 요약 판단용 (링크 자체는 Tavily 결과에서 직접 사용)
  const competitorContext = TRACKED_COMPETITORS.map((comp) => {
    const results = competitorRawMap[comp.brand] ?? []
    if (results.length === 0) return `[${comp.brand}]\n검색 결과 없음`
    return (
      `[${comp.brand}]\n` +
      results.map((r, i) => `  (${i + 1}) ${r.title}\n  ${r.content}`).join('\n\n')
    )
  }).join('\n\n---\n\n')

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    max_completion_tokens: 1600,
    messages: [
      {
        role: 'system',
        content: `당신은 일본 디지털 마케팅 전문가입니다. 한국어로 브리핑을 작성하세요.

【트렌드 분석 규칙 — 반드시 준수】
- 오직 ${dateKR}(${dateJP})에 게시/발행된 내용만 topics에 포함하세요.
- 검색 결과의 제목·본문에 "${dateJP}" 또는 "${searchDate}"가 명시된 경우에만 사용하세요.
- 날짜가 불분명하거나 ${dateKR} 이전/이후 날짜의 내용은 절대 포함하지 마세요.
- 해당 날짜 내용이 없으면 topics를 빈 배열([])로 반환하세요.

【경쟁사 분석 규칙】
- 해당 회사가 검색 결과에서 확인되면 found: true
- 회사와 무관한 결과만 있으면 found: false
- summary: 발견된 내용 1-2문장 요약 (미발견이면 "검색 결과에서 확인되지 않았습니다.")

반드시 아래 JSON 형식으로만 응답하세요:
{
  "summary": "${dateKR} 트렌드 2-3문장 요약 (해당 날짜 내용이 없으면 '${dateKR} 기준 새로운 트렌드 정보가 없습니다.')",
  "topics": [
    { "title": "주제명", "description": "2-3문장 설명", "source": "출처 제목(선택)" }
  ],
  "competitorPR": [
    {
      "brand": "회사명",
      "found": true,
      "summary": "발견된 활동/언급 1-2문장 요약"
    }
  ]
}

topics는 최대 5개. competitorPR은 검색 대상 회사 전체를 포함하세요.`,
      },
      {
        role: 'user',
        content: `=== ${dateKR} 일본 SNS 트렌드 검색 결과 ===\n\n${trendContext}\n\n=== 경쟁사 언급/활동 검색 결과 ===\n\n${competitorContext}`,
      },
    ],
    response_format: { type: 'json_object' },
  })

  let parsed: {
    summary: string
    topics: MarketBriefTopic[]
    competitorPR: Array<{ brand: string; found: boolean; summary: string }>
  } = { summary: '', topics: [], competitorPR: [] }

  try {
    parsed = JSON.parse(response.choices[0].message.content ?? '{}')
  } catch {
    parsed.summary = response.choices[0].message.content ?? ''
  }

  // OpenAI 결과 + Tavily 링크를 합쳐서 최종 competitorPR 구성
  const competitorPR: CompetitorPR[] = TRACKED_COMPETITORS.map((comp) => {
    const aiResult = (parsed.competitorPR ?? []).find((c) => c.brand === comp.brand)
    const raw = competitorRawMap[comp.brand] ?? []
    const found = aiResult?.found ?? raw.length > 0
    return {
      brand: comp.brand,
      found,
      summary: aiResult?.summary ?? (found ? '검색 결과 발견' : '검색 결과에서 확인되지 않았습니다.'),
      links: raw.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content.slice(0, 180),
      })),
    }
  })

  return {
    date: today,
    searchDate,
    summary: parsed.summary || '요약 생성 실패',
    topics: parsed.topics || [],
    competitorPR,
    sources: trendResults.slice(0, 8).map((r) => ({ title: r.title, url: r.url })),
  }
}
