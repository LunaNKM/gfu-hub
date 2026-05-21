/**
 * Cohere Rerank 유틸리티
 * COHERE_API_KEY 환경변수가 없으면 null 반환 → 하이브리드 스코어링으로 폴백
 *
 * 모델: rerank-v3.5 (multilingual — 한국어·일본어 지원)
 * 비용: $1 / 1,000 rerank 요청 (5명 규모 월 $1 미만)
 * 역할: findNearest() 후보군을 질문-청크 쌍으로 함께 평가 → 하이브리드보다 정확
 */

interface CohereRerankResult {
  index: number
  relevanceScore: number
}

export async function cohereRerank(
  query: string,
  documents: string[],
  topN: number
): Promise<CohereRerankResult[] | null> {
  const apiKey = process.env.COHERE_API_KEY
  if (!apiKey || documents.length === 0) return null

  try {
    const res = await fetch('https://api.cohere.com/v2/rerank', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'rerank-v3.5',
        query,
        documents,
        top_n: topN,
        return_documents: false,
      }),
    })

    if (!res.ok) {
      console.error('Cohere Rerank 오류:', res.status, await res.text())
      return null
    }

    const data = await res.json()
    return (data.results ?? []).map((r: { index: number; relevance_score: number }) => ({
      index: r.index,
      relevanceScore: r.relevance_score,
    }))
  } catch (err) {
    console.error('Cohere Rerank 실패:', err)
    return null
  }
}
