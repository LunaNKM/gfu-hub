import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { DocChunk } from '@/types'
import { getOpenAIClient } from './client'
import { cohereRerank } from './rerank'

// docChunks 10분 세션 캐시 — 문서가 자주 바뀌지 않으므로 재요청 불필요
let chunksCache: { data: DocChunk[]; ts: number } | null = null
const CHUNKS_TTL = 10 * 60 * 1000

export function invalidateChunksCache(): void {
  chunksCache = null
}

async function getAllChunks(): Promise<DocChunk[]> {
  if (chunksCache && Date.now() - chunksCache.ts < CHUNKS_TTL) return chunksCache.data

  const db = getFirestoreInstance()
  if (!db) return []

  const q = query(collection(db, 'docChunks'), orderBy('updatedAt', 'desc'))
  const snapshot = await getDocs(q)
  const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as DocChunk[]
  chunksCache = { data, ts: Date.now() }
  return data
}

export async function getEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient()
  if (!client) return []

  try {
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    })
    return response.data[0].embedding
  } catch (error) {
    console.error('임베딩 생성 오류:', error)
    return []
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0)
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))
  if (normA === 0 || normB === 0) return 0
  return dot / (normA * normB)
}

function keywordScore(content: string, query: string): number {
  const lowerContent = content.toLowerCase()
  const terms = query.toLowerCase().split(/\s+/)
  const matches = terms.filter((term) => lowerContent.includes(term))
  return matches.length / terms.length
}

export async function searchRelevantDocs(
  searchQuery: string,
  limit = 10,
  minScore = 0.15
): Promise<{ docId: string; title: string; content: string; score: number }[]> {
  try {
    const queryEmbedding = await getEmbedding(searchQuery)

    // ── 브루트포스 폴백 (캐시 활용, O(n) JS 연산) ────────────────
    const chunks = await getAllChunks()
    if (chunks.length === 0) return []

    let scored: { docId: string; title: string; content: string; score: number }[]

    if (queryEmbedding.length > 0) {
      scored = chunks
        .filter((chunk) => chunk.embedding && chunk.embedding.length > 0)
        .map((chunk) => ({
          docId: chunk.docId,
          title: chunk.title,
          content: chunk.content,
          score: cosineSimilarity(queryEmbedding, chunk.embedding!),
        }))

      const noEmbedding = chunks
        .filter((chunk) => !chunk.embedding || chunk.embedding.length === 0)
        .map((chunk) => ({
          docId: chunk.docId,
          title: chunk.title,
          content: chunk.content,
          score: keywordScore(chunk.content, searchQuery) * 0.5,
        }))

      scored = [...scored, ...noEmbedding]
    } else {
      scored = chunks.map((chunk) => ({
        docId: chunk.docId,
        title: chunk.title,
        content: chunk.content,
        score: keywordScore(chunk.content, searchQuery),
      }))
    }

    return scored
      .filter((item) => item.score > minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  } catch (error) {
    console.error('RAG 검색 오류:', error)
    return []
  }
}

/**
 * 전수 스캔 전용: 모든 문서의 첫 번째 청크에서 제목 + 150자 스니펫만 반환.
 * "모든 캠페인 리스트업" 같은 전체 조회 요청에 사용.
 * 토큰 소모를 최소화하면서 커버리지 100% 보장.
 */
export async function scanAllDocTitles(): Promise<{ docId: string; title: string; snippet: string }[]> {
  const chunks = await getAllChunks()
  const seen = new Set<string>()
  return chunks
    .filter((c) => {
      if (seen.has(c.docId)) return false
      seen.add(c.docId)
      return true
    })
    .map((c) => ({
      docId: c.docId,
      title: c.title,
      snippet: c.content.slice(0, 150).replace(/\n/g, ' '),
    }))
}

/**
 * 리스트·열거 질문 전용: 관련 문서의 모든 청크를 가져온다.
 * 상위 K개 문서를 먼저 식별한 뒤, 해당 문서의 청크를 전량 수집한다.
 */
export async function searchAllChunksFromTopDocs(
  searchQuery: string,
  topDocCount = 5,
  maxTotalChunks = 40
): Promise<{ docId: string; title: string; content: string; score: number }[]> {
  try {
    const chunks = await getAllChunks()

    if (chunks.length === 0) return []

    const queryEmbedding = await getEmbedding(searchQuery)

    // 1단계: 각 청크에 점수 부여
    const scored = chunks.map((chunk) => {
      let score = 0
      if (queryEmbedding.length > 0 && chunk.embedding && chunk.embedding.length > 0) {
        score = cosineSimilarity(queryEmbedding, chunk.embedding)
      } else {
        score = keywordScore(chunk.content, searchQuery)
      }
      return { docId: chunk.docId, title: chunk.title, content: chunk.content, score }
    })

    // 2단계: 문서별 최고 점수 집계 → 상위 N개 docId 선정
    const docMaxScore: Record<string, number> = {}
    for (const item of scored) {
      if (!docMaxScore[item.docId] || item.score > docMaxScore[item.docId]) {
        docMaxScore[item.docId] = item.score
      }
    }
    const topDocIds = Object.entries(docMaxScore)
      .filter(([, s]) => s > 0.05)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topDocCount)
      .map(([docId]) => docId)

    if (topDocIds.length === 0) {
      // 관련 문서를 못 찾으면 일반 검색으로 폴백
      return scored
        .filter((i) => i.score > 0.05)
        .sort((a, b) => b.score - a.score)
        .slice(0, 30)
    }

    // 3단계: 선정된 문서의 모든 청크 수집 (점수 순 정렬)
    return scored
      .filter((item) => topDocIds.includes(item.docId))
      .sort((a, b) => {
        // 같은 문서 내에서는 원본 순서 유지를 위해 score 차이가 작으면 동등 처리
        const docOrderA = topDocIds.indexOf(a.docId)
        const docOrderB = topDocIds.indexOf(b.docId)
        if (docOrderA !== docOrderB) return docOrderA - docOrderB
        return b.score - a.score
      })
      .slice(0, maxTotalChunks)
  } catch (error) {
    console.error('RAG 전체 청크 검색 오류:', error)
    return []
  }
}

/**
 * Phase 2-2 — 리스팅 쿼리 전용 요약 레이어
 *
 * searchAllChunksFromTopDocs(5, 40) = 최대 40청크 × 1000자 = 40,000자 (토큰 폭발)
 * summarizeForListing(8, 500)       = 최대 8문서 × 500자  =  4,000자 (90% 절감)
 *
 * 각 문서의 청크를 순서대로 합친 뒤 charsPerDoc로 잘라 하나의 요약 블록으로 반환.
 * 리스팅 질문에서는 문서별 핵심 파악이 목적이므로 전체 청크보다 요약이 적합.
 */
export async function summarizeForListing(
  searchQuery: string,
  topDocCount = 8,
  charsPerDoc = 500
): Promise<{ docId: string; title: string; content: string; score: number }[]> {
  // 상위 문서의 청크를 넉넉히 가져온 후 문서별로 압축
  const raw = await searchAllChunksFromTopDocs(searchQuery, topDocCount, topDocCount * 10)

  const docMap = new Map<string, { title: string; parts: string[]; score: number }>()
  for (const item of raw) {
    if (!docMap.has(item.docId)) {
      docMap.set(item.docId, { title: item.title, parts: [], score: item.score })
    }
    docMap.get(item.docId)!.parts.push(item.content)
  }

  return Array.from(docMap.entries()).map(([docId, { title, parts, score }]) => ({
    docId,
    title,
    // 청크들을 이어 붙인 뒤 공백 정리 → charsPerDoc 글자로 자름
    content: parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, charsPerDoc),
    score,
  }))
}
