import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  limit as firestoreLimit,
} from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { DocChunk } from '@/types'
import { getOpenAIClient } from './client'
import { cohereRerank } from './rerank'

// ── Doc-level 인덱스 (2단계 검색 Stage 1) ───────────────────────
// docs 컬렉션에서 docEmbedding 필드만 활용 — 청크 전체 로드 없이 관련 문서 선별
interface DocIndex {
  id: string
  title: string
  docEmbedding?: number[]
}

let docIndexCache: { data: DocIndex[]; ts: number } | null = null
const DOC_INDEX_TTL = 10 * 60 * 1000  // 10분

export function invalidateDocIndexCache(): void {
  docIndexCache = null
  chunksCache = null
  _idfCache = null
}

async function getDocIndex(): Promise<DocIndex[]> {
  if (docIndexCache && Date.now() - docIndexCache.ts < DOC_INDEX_TTL) return docIndexCache.data

  const db = getFirestoreInstance()
  if (!db) return []

  try {
    const q = query(collection(db, 'docs'), orderBy('updatedAt', 'desc'))
    const snap = await getDocs(q)
    const data: DocIndex[] = snap.docs.map((d) => ({
      id: d.id,
      title: (d.data().title as string) ?? '',
      docEmbedding: d.data().docEmbedding as number[] | undefined,
    }))
    docIndexCache = { data, ts: Date.now() }
    return data
  } catch (err) {
    console.error('DocIndex 로드 오류:', err)
    return []
  }
}

// ── 청크 캐시 (2단계 검색 Stage 2) ─────────────────────────────
// 특정 docId 목록의 청크만 로드 — 전체 300개 제한 해소
let chunksCache: { data: DocChunk[]; ts: number } | null = null
const CHUNKS_TTL = 10 * 60 * 1000

// ── BM25 IDF 캐시 ─────────────────────────────────────────────
interface IdfData {
  idf: Map<string, number>
  avgDocLen: number
}

let _idfCache: { data: IdfData; ts: number } | null = null
const IDF_TTL = 10 * 60 * 1000

export function invalidateChunksCache(): void {
  chunksCache = null
  _idfCache = null
}

// scan_all / summarize 용 전체 청크 (최신 300개 제한 유지)
const CHUNKS_FETCH_LIMIT = 300

async function getAllChunks(): Promise<DocChunk[]> {
  if (chunksCache && Date.now() - chunksCache.ts < CHUNKS_TTL) return chunksCache.data

  const db = getFirestoreInstance()
  if (!db) return []

  const q = query(collection(db, 'docChunks'), orderBy('updatedAt', 'desc'), firestoreLimit(CHUNKS_FETCH_LIMIT))
  const snapshot = await getDocs(q)
  const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as DocChunk[]
  chunksCache = { data, ts: Date.now() }
  return data
}

// 특정 문서들의 청크만 Firestore에서 쿼리 (Firestore 'in' 쿼리, 최대 10개)
async function getChunksForDocs(docIds: string[]): Promise<DocChunk[]> {
  if (docIds.length === 0) return []

  const db = getFirestoreInstance()
  if (!db) return []

  try {
    // Firestore 'in' 쿼리 — 한 번에 최대 10개 docId
    const batches = []
    for (let i = 0; i < docIds.length; i += 10) {
      batches.push(docIds.slice(i, i + 10))
    }

    const results: DocChunk[] = []
    await Promise.all(
      batches.map(async (batch) => {
        const q = query(collection(db, 'docChunks'), where('docId', 'in', batch))
        const snap = await getDocs(q)
        snap.docs.forEach((d) => results.push({ id: d.id, ...d.data() } as DocChunk))
      })
    )
    return results
  } catch (err) {
    console.error('getChunksForDocs 오류:', err)
    return []
  }
}

// ── 임베딩 (in-flight 중복 제거) ────────────────────────────────
const _embeddingInFlight = new Map<string, Promise<number[]>>()

export async function getEmbedding(text: string): Promise<number[]> {
  const key = text.slice(0, 500)
  const inFlight = _embeddingInFlight.get(key)
  if (inFlight) return inFlight

  const promise = (async () => {
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
  })()

  _embeddingInFlight.set(key, promise)
  void promise.finally(() => _embeddingInFlight.delete(key))
  return promise
}

// ── 유틸 ────────────────────────────────────────────────────────
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

// ── BM25 (sparse retrieval, 고유명사·정확매칭에 강함) ────────────
const BM25_K1 = 1.5
const BM25_B = 0.75
const STOPWORDS = new Set([
  // 한국어
  '그리고', '하지만', '그러나', '그래서', '또한', '이것', '저것', '그것', '있는', '없는', '입니다', '합니다',
  // 일본어
  'です', 'ます', 'して', 'した', 'ある', 'いる', 'これ', 'それ', 'あれ',
  // 영어
  'the', 'and', 'for', 'with', 'this', 'that', 'are', 'was', 'were', 'have', 'has',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\sぁ-んァ-ヶー一-龯가-힣]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
}

function buildIdf(chunks: DocChunk[]): IdfData {
  const N = chunks.length
  const df = new Map<string, number>()
  let totalLen = 0
  for (const c of chunks) {
    const uniq = new Set(tokenize(`${c.title} ${c.content}`))
    totalLen += uniq.size
    for (const t of uniq) df.set(t, (df.get(t) ?? 0) + 1)
  }
  const idf = new Map<string, number>()
  for (const [t, dfVal] of df) {
    idf.set(t, Math.log((N - dfVal + 0.5) / (dfVal + 0.5) + 1))
  }
  return { idf, avgDocLen: totalLen / Math.max(1, N) }
}

function bm25Score(chunkText: string, queryTokens: string[], idfData: IdfData): number {
  const docTokens = tokenize(chunkText)
  const docLen = docTokens.length
  if (docLen === 0) return 0
  const tf = new Map<string, number>()
  for (const t of docTokens) tf.set(t, (tf.get(t) ?? 0) + 1)

  let score = 0
  for (const qt of queryTokens) {
    const f = tf.get(qt) ?? 0
    if (f === 0) continue
    const termIdf = idfData.idf.get(qt) ?? 0
    const num = f * (BM25_K1 + 1)
    const den = f + BM25_K1 * (1 - BM25_B + (BM25_B * docLen) / idfData.avgDocLen)
    score += (termIdf * num) / den
  }
  return score
}

function normalizeBm25(raw: number): number {
  return Math.min(raw / 10, 1)
}

async function getIdf(): Promise<IdfData> {
  if (_idfCache && Date.now() - _idfCache.ts < IDF_TTL) return _idfCache.data
  const all = await getAllChunks()
  const data = buildIdf(all)
  _idfCache = { data, ts: Date.now() }
  return data
}

// ── 2단계 문서 선별 ─────────────────────────────────────────────
// doc-level embedding으로 관련 문서 N개 선정 → 해당 문서의 청크만 로드
async function selectTopDocIds(
  queryEmbedding: number[],
  searchQuery: string,
  topN: number,
  minDocScore: number
): Promise<string[]> {
  const docIndex = await getDocIndex()
  if (docIndex.length === 0) return []

  const scored = docIndex.map((doc) => {
    let score = 0
    if (queryEmbedding.length > 0 && doc.docEmbedding && doc.docEmbedding.length > 0) {
      score = cosineSimilarity(queryEmbedding, doc.docEmbedding)
    } else {
      score = keywordScore(doc.title, searchQuery) * 0.6
    }
    return { id: doc.id, score }
  })

  return scored
    .filter((d) => d.score >= minDocScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((d) => d.id)
}

// ── 메인 검색: 2단계 + Cohere Rerank ────────────────────────────
export async function searchRelevantDocs(
  searchQuery: string,
  limit = 10,
  minScore = 0.25
): Promise<{ docId: string; title: string; content: string; score: number }[]> {
  try {
    const queryEmbedding = await getEmbedding(searchQuery)

    // Stage 1: doc-level 유사도로 상위 8개 문서 선별 (minDocScore=0.15 — 넓게 잡아 Stage 2에서 좁힘)
    const topDocIds = await selectTopDocIds(queryEmbedding, searchQuery, 8, 0.15)

    let chunks: DocChunk[]
    if (topDocIds.length > 0) {
      // Stage 2: 선별된 문서의 청크만 로드 (전체 300개 제한 우회)
      chunks = await getChunksForDocs(topDocIds)
    } else {
      // 폴백: doc-level 인덱스 없는 환경 → 전체 청크 브루트포스
      chunks = await getAllChunks()
    }

    if (chunks.length === 0) return []

    // 청크 레벨 스코어링 (Hybrid: 0.6 * dense + 0.4 * BM25)
    const queryTokens = tokenize(searchQuery)
    const idfData = await getIdf()

    const scored = chunks.map((c) => {
      const denseScore =
        queryEmbedding.length > 0 && c.embedding && c.embedding.length > 0
          ? cosineSimilarity(queryEmbedding, c.embedding)
          : 0
      const bm25Raw = bm25Score(`${c.title}\n${c.content}`, queryTokens, idfData)
      const bm25Norm = normalizeBm25(bm25Raw)
      const fused = denseScore > 0
        ? 0.6 * denseScore + 0.4 * bm25Norm
        : bm25Norm
      return {
        docId: c.docId,
        title: c.title,
        content: c.content,
        score: fused,
      }
    })

    // 초기 필터: 낮은 임계값으로 후보 40개 선별 (Cohere rerank 입력)
    const candidates = scored
      .filter((item) => item.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)

    if (candidates.length === 0) return []

    // Cohere Rerank 시도 (API 키 없으면 자동 null → 코사인 폴백)
    const rerankResults = await cohereRerank(
      searchQuery,
      candidates.map((c) => `${c.title}\n${c.content}`),
      limit
    )

    if (rerankResults) {
      // Cohere 기준 score >= 0.3인 결과만 반환
      return rerankResults
        .filter((r) => r.relevanceScore >= 0.3)
        .map((r) => candidates[r.index])
        .slice(0, limit)
    }

    // 폴백: 코사인 점수 기준 minScore 필터
    return candidates
      .filter((item) => item.score > minScore)
      .slice(0, limit)
  } catch (error) {
    console.error('RAG 검색 오류:', error)
    return []
  }
}

/**
 * 전수 스캔 전용: doc-level 인덱스에서 제목 + 스니펫(첫 청크) 반환.
 * "모든 캠페인 리스트업" 같은 전체 조회 요청에 사용.
 */
export async function scanAllDocTitles(): Promise<{ docId: string; title: string; snippet: string }[]> {
  const docIndex = await getDocIndex()

  if (docIndex.length > 0) {
    // doc-level 인덱스 사용 (빠름)
    return docIndex.map((d) => ({
      docId: d.id,
      title: d.title,
      snippet: '',
    }))
  }

  // 폴백: 청크에서 첫 번째 청크만 수집
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
 * 리스트·열거 질문 전용: 2단계로 관련 문서의 청크 수집.
 */
export async function searchAllChunksFromTopDocs(
  searchQuery: string,
  topDocCount = 5,
  maxTotalChunks = 40
): Promise<{ docId: string; title: string; content: string; score: number }[]> {
  try {
    const queryEmbedding = await getEmbedding(searchQuery)

    // Stage 1: doc-level 선별
    const topDocIds = await selectTopDocIds(queryEmbedding, searchQuery, topDocCount, 0.15)

    let chunks: DocChunk[]
    if (topDocIds.length > 0) {
      chunks = await getChunksForDocs(topDocIds)
    } else {
      // 폴백: 전체 청크 브루트포스
      chunks = await getAllChunks()
      if (chunks.length === 0) return []

      // doc-level 인덱스 없는 환경 — 청크 직접 스코어링 (Hybrid: 0.6 * dense + 0.4 * BM25)
      const fallbackTokens = tokenize(searchQuery)
      const fallbackIdf = await getIdf()
      const scored = chunks.map((chunk) => {
        const denseScore =
          queryEmbedding.length > 0 && chunk.embedding && chunk.embedding.length > 0
            ? cosineSimilarity(queryEmbedding, chunk.embedding)
            : 0
        const bm25Raw = bm25Score(`${chunk.title}\n${chunk.content}`, fallbackTokens, fallbackIdf)
        const bm25Norm = normalizeBm25(bm25Raw)
        const score = denseScore > 0 ? 0.6 * denseScore + 0.4 * bm25Norm : bm25Norm
        return { docId: chunk.docId, title: chunk.title, content: chunk.content, score }
      })
      const docMaxScore: Record<string, number> = {}
      for (const item of scored) {
        if (!docMaxScore[item.docId] || item.score > docMaxScore[item.docId]) {
          docMaxScore[item.docId] = item.score
        }
      }
      const fallbackTopIds = Object.entries(docMaxScore)
        .filter(([, s]) => s > 0.2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topDocCount)
        .map(([id]) => id)

      if (fallbackTopIds.length === 0) {
        return scored.filter((i) => i.score > 0.2).sort((a, b) => b.score - a.score).slice(0, 30)
      }
      return scored
        .filter((item) => fallbackTopIds.includes(item.docId))
        .sort((a, b) => {
          const orderA = fallbackTopIds.indexOf(a.docId)
          const orderB = fallbackTopIds.indexOf(b.docId)
          if (orderA !== orderB) return orderA - orderB
          return b.score - a.score
        })
        .slice(0, maxTotalChunks)
    }

    if (chunks.length === 0) return []

    // Stage 2: 선별된 청크 스코어링 (Hybrid: 0.6 * dense + 0.4 * BM25)
    const queryTokens = tokenize(searchQuery)
    const idfData = await getIdf()
    const scored = chunks.map((chunk) => {
      const denseScore =
        queryEmbedding.length > 0 && chunk.embedding && chunk.embedding.length > 0
          ? cosineSimilarity(queryEmbedding, chunk.embedding)
          : 0
      const bm25Raw = bm25Score(`${chunk.title}\n${chunk.content}`, queryTokens, idfData)
      const bm25Norm = normalizeBm25(bm25Raw)
      const score = denseScore > 0 ? 0.6 * denseScore + 0.4 * bm25Norm : bm25Norm
      return { docId: chunk.docId, title: chunk.title, content: chunk.content, score }
    })

    return scored
      .filter((item) => topDocIds.includes(item.docId))
      .sort((a, b) => {
        const orderA = topDocIds.indexOf(a.docId)
        const orderB = topDocIds.indexOf(b.docId)
        if (orderA !== orderB) return orderA - orderB
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
 */
export async function summarizeForListing(
  searchQuery: string,
  topDocCount = 8,
  charsPerDoc = 500
): Promise<{ docId: string; title: string; content: string; score: number }[]> {
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
    content: parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, charsPerDoc),
    score,
  }))
}
