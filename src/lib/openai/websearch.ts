/**
 * Tavily 웹 검색 유틸리티
 * TAVILY_API_KEY 환경변수가 없으면 null 반환 (폴백: LLM 학습 데이터 사용)
 */

export interface WebSearchResult {
  title: string
  url: string
  content: string
  score: number
}

export interface WebSearchResponse {
  answer: string | null
  results: WebSearchResult[]
}

export async function webSearch(query: string): Promise<WebSearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    return { answer: null, results: [] }
  }

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        include_answer: true,
        include_raw_content: false,
        max_results: 5,
      }),
    })

    if (!res.ok) {
      console.error('Tavily 검색 오류:', res.status, await res.text())
      return { answer: null, results: [] }
    }

    const data = await res.json()
    return {
      answer: data.answer ?? null,
      results: (data.results ?? []).map((r: WebSearchResult) => ({
        title: r.title,
        url: r.url,
        content: r.content?.slice(0, 1000) ?? '',
        score: r.score ?? 0,
      })),
    }
  } catch (err) {
    console.error('웹 검색 실패:', err)
    return { answer: null, results: [] }
  }
}
