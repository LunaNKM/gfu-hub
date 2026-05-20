/**
 * 일본 시장 인텔리전스 브리핑 생성 로직
 * route.ts에서 export하면 Next.js가 Route export로 오해하므로 별도 파일로 분리
 */

import OpenAI from 'openai'
import { MarketBriefTopic } from '@/types'

// ── Tavily 검색 ───────────────────────────────────────────────
interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
}

// days: Tavily에 "최근 N일 이내" 결과만 반환하도록 지시
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

  // days=2: Tavily가 최근 48시간 이내 결과만 반환 (어제 전체 커버)
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

  if (trendResults.length === 0) {
    return {
      date: today,
      searchDate,
      summary: '검색 결과를 가져올 수 없습니다. Tavily API 키를 확인하세요.',
      topics: [],
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
      sources: trendResults.slice(0, 5).map((r) => ({ title: r.title, url: r.url })),
    }
  }

  const openai = new OpenAI({ apiKey: openaiKey })

  const trendContext = trendResults
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.content}`)
    .join('\n\n')

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    max_completion_tokens: 1200,
    messages: [
      {
        role: 'system',
        content: `당신은 일본 디지털 마케팅 전문가입니다. 한국어로 브리핑을 작성하세요.

【규칙 — 반드시 준수】
- 오직 ${dateKR}(${dateJP})에 게시/발행된 내용만 topics에 포함하세요.
- 검색 결과의 제목·본문에 "${dateJP}" 또는 "${searchDate}"가 명시된 경우에만 사용하세요.
- 날짜가 불분명하거나 ${dateKR} 이전/이후 날짜의 내용은 절대 포함하지 마세요.
- 해당 날짜의 내용이 없으면 topics를 빈 배열([])로 반환하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "summary": "${dateKR} 트렌드 2-3문장 요약 (해당 날짜 내용이 없으면 '${dateKR} 기준 새로운 트렌드 정보가 없습니다.')",
  "topics": [
    { "title": "주제명", "description": "2-3문장 설명", "source": "출처 제목(선택)" }
  ]
}

topics는 최대 5개, 실제 검색 결과에서 확인된 내용만 포함하세요.`,
      },
      {
        role: 'user',
        content: `${dateKR}(${dateJP}) 일본 SNS 트렌드 검색 결과:\n\n${trendContext}`,
      },
    ],
    response_format: { type: 'json_object' },
  })

  let parsed: { summary: string; topics: MarketBriefTopic[] } = { summary: '', topics: [] }
  try {
    parsed = JSON.parse(response.choices[0].message.content ?? '{}')
  } catch {
    parsed.summary = response.choices[0].message.content ?? ''
  }

  return {
    date: today,
    searchDate,
    summary: parsed.summary || '요약 생성 실패',
    topics: parsed.topics || [],
    sources: trendResults.slice(0, 8).map((r) => ({ title: r.title, url: r.url })),
  }
}
