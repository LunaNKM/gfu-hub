/**
 * 장기 기억 서비스
 *
 * memories 컬렉션: { userId, content, embedding, importance, conversationId, createdAt }
 *
 * TASK 4 — 중복 제거: 저장 전 코사인 유사도 > 0.88인 기존 기억이 있으면 스킵
 * TASK 5 — 3축 점수: 종합 = 0.5×관련성 + 0.3×최신성 + 0.2×중요도
 */

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  Timestamp,
} from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { getEmbedding } from '../openai/rag'

// ── 유틸: 코사인 유사도 ──────────────────────────────────────
function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  const dot = a.reduce((s, v, i) => s + v * b[i], 0)
  const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0))
  const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0))
  if (normA === 0 || normB === 0) return 0
  return dot / (normA * normB)
}

// ── TASK 5: 최신성 점수 (지수 감쇠, 30일 반감기) ─────────────
// 오늘=1.0 / 1주=0.79 / 1개월=0.37 / 3개월=0.05
function recencyScore(createdAt: Date): number {
  const daysSince = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  return Math.exp(-daysSince / 30)
}

// ── 캐시 엔트리 타입 ─────────────────────────────────────────
interface MemoryEntry {
  content: string
  embedding?: number[]
  importance: number    // 1~5 (기본 3)
  createdAt: Date
}

// ── 인메모리 캐시 (사용자별, 5분 TTL) ───────────────────────
const memoriesCache = new Map<string, { data: MemoryEntry[]; ts: number }>()
const MEMORIES_TTL = 5 * 60 * 1000

export function invalidateMemoriesCache(userId: string): void {
  memoriesCache.delete(userId)
}

// ── 기억 로드 헬퍼 ───────────────────────────────────────────
async function loadMemories(userId: string): Promise<MemoryEntry[]> {
  const cached = memoriesCache.get(userId)
  if (cached && Date.now() - cached.ts < MEMORIES_TTL) return cached.data

  const db = getFirestoreInstance()
  if (!db) return []

  try {
    const q = query(
      collection(db, 'memories'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      firestoreLimit(100)
    )
    const snapshot = await getDocs(q)
    const data: MemoryEntry[] = snapshot.docs.map((d) => {
      const raw = d.data()
      const ts = raw.createdAt as Timestamp
      return {
        content: raw.content as string,
        embedding: raw.embedding as number[] | undefined,
        importance: (raw.importance as number | undefined) ?? 3,
        createdAt: ts?.toDate?.() ?? new Date(),
      }
    })
    memoriesCache.set(userId, { data, ts: Date.now() })
    return data
  } catch {
    return []
  }
}

// ── 저장 (TASK 4: 중복 제거 포함) ────────────────────────────
// facts: { content, importance? }[] — importance는 1(낮음)~5(높음), 기본 3
export async function saveMemories(
  userId: string,
  facts: { content: string; importance?: number }[],
  conversationId?: string
): Promise<void> {
  const db = getFirestoreInstance()
  if (!db || facts.length === 0) return

  const existing = await loadMemories(userId)
  const newEntries: MemoryEntry[] = []

  for (const { content: fact, importance = 3 } of facts) {
    const embedding = await getEmbedding(fact)

    // TASK 4: 중복 제거 — 코사인 유사도 > 0.88이면 이미 있는 정보로 판단하고 스킵
    if (embedding.length > 0 && existing.length > 0) {
      const maxSim = Math.max(
        ...existing.map((m) => (m.embedding ? cosineSim(embedding, m.embedding) : 0))
      )
      if (maxSim > 0.88) {
        console.log(`[Memory] 중복 스킵 (sim=${maxSim.toFixed(3)}): "${fact.slice(0, 60)}"`)
        continue
      }
    }

    await addDoc(collection(db, 'memories'), {
      userId,
      content: fact,
      importance,
      ...(embedding.length > 0 ? { embedding } : {}),
      ...(conversationId ? { conversationId } : {}),
      createdAt: Timestamp.now(),
    })

    newEntries.push({ content: fact, embedding, importance, createdAt: new Date() })
  }

  // 캐시 즉시 갱신 (재로드 불필요)
  if (newEntries.length > 0) {
    const updated = [...newEntries, ...existing]
    memoriesCache.set(userId, { data: updated, ts: Date.now() })
    console.log(`[Memory] ${newEntries.length}개 저장 완료 (총 ${updated.length}개)`)
  }
}

// ── 조회 (TASK 5: 3축 점수) ──────────────────────────────────
// 종합 점수 = 0.5×관련성(코사인) + 0.3×최신성(지수감쇠) + 0.2×중요도(정규화)
// → 관련성이 부족해도 최신·중요 기억은 상위에 노출됨
export async function getRelevantMemories(
  userId: string,
  searchQuery: string,
  topN = 3
): Promise<string[]> {
  const allMemories = await loadMemories(userId)
  if (allMemories.length === 0) return []

  // 임베딩 생성 (getEmbedding in-flight 중복 제거 덕분에 route.ts의 동시 호출과 API 1회만 발생)
  const queryEmb = await getEmbedding(searchQuery)

  return allMemories
    .map((m) => {
      const relevance = queryEmb.length > 0 && m.embedding
        ? cosineSim(queryEmb, m.embedding)
        : 0
      const recency = recencyScore(m.createdAt)
      const importanceNorm = m.importance / 5
      // TASK 5 종합 점수
      const score = 0.5 * relevance + 0.3 * recency + 0.2 * importanceNorm
      return { content: m.content, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((m) => m.content)
}
