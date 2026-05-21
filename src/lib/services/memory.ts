/**
 * 장기 기억 서비스
 *
 * 대화 후 핵심 사실을 추출·저장하고, 다음 대화 시작 시 관련 기억을 주입.
 * memories 컬렉션: { userId, content, embedding, conversationId, createdAt }
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

// cosineSimilarity (rag.ts의 private 함수를 로컬 복사)
function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  const dot = a.reduce((s, v, i) => s + v * b[i], 0)
  const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0))
  const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0))
  if (normA === 0 || normB === 0) return 0
  return dot / (normA * normB)
}

// ── 메모리 캐시 (사용자별, 5분 TTL) ──────────────────────────
// 동일 세션 내 반복 조회 시 Firestore 읽기 0회
const memoriesCache = new Map<string, { data: { content: string; embedding?: number[] }[]; ts: number }>()
const MEMORIES_TTL = 5 * 60 * 1000

export function invalidateMemoriesCache(userId: string): void {
  memoriesCache.delete(userId)
}

// ── 저장 ─────────────────────────────────────────────────────
export async function saveMemories(
  userId: string,
  facts: string[],
  conversationId?: string
): Promise<void> {
  const db = getFirestoreInstance()
  if (!db || facts.length === 0) return

  for (const fact of facts) {
    const embedding = await getEmbedding(fact)
    await addDoc(collection(db, 'memories'), {
      userId,
      content: fact,
      ...(embedding.length > 0 ? { embedding } : {}),
      ...(conversationId ? { conversationId } : {}),
      createdAt: Timestamp.now(),
    })
  }

  invalidateMemoriesCache(userId)
}

// ── 조회 (임베딩 유사도 검색 + 최신 순 폴백) ─────────────────
export async function getRelevantMemories(
  userId: string,
  searchQuery: string,
  topN = 3
): Promise<string[]> {
  const db = getFirestoreInstance()
  if (!db) return []

  // 캐시 확인
  const cached = memoriesCache.get(userId)
  let allMemories: { content: string; embedding?: number[] }[]

  if (cached && Date.now() - cached.ts < MEMORIES_TTL) {
    allMemories = cached.data
  } else {
    try {
      const q = query(
        collection(db, 'memories'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        firestoreLimit(100)
      )
      const snapshot = await getDocs(q)
      allMemories = snapshot.docs.map((d) => ({
        content: d.data().content as string,
        embedding: d.data().embedding as number[] | undefined,
      }))
      memoriesCache.set(userId, { data: allMemories, ts: Date.now() })
    } catch {
      return []
    }
  }

  if (allMemories.length === 0) return []

  // 임베딩 유사도로 재순위
  const queryEmb = await getEmbedding(searchQuery)
  if (queryEmb.length > 0) {
    return allMemories
      .map((m) => ({ content: m.content, score: m.embedding ? cosineSim(queryEmb, m.embedding) : 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map((m) => m.content)
  }

  // 폴백: 최신 순
  return allMemories.slice(0, topN).map((m) => m.content)
}
