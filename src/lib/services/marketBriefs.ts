import {
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { MarketBrief } from '@/types'

function convertTimestamp(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate()
  if (ts instanceof Date) return ts
  return new Date()
}

function docToBrief(d: { id: string; data: () => Record<string, unknown> }): MarketBrief {
  const data = d.data()
  return {
    id: d.id,
    date: (data.date as string) ?? '',
    searchDate: (data.searchDate as string) ?? (data.date as string) ?? '', // 구버전 호환
    summary: (data.summary as string) ?? '',
    topics: (data.topics as MarketBrief['topics']) ?? [],
    sources: (data.sources as MarketBrief['sources']) ?? [],
    createdAt: convertTimestamp(data.createdAt),
    expiresAt: convertTimestamp(data.expiresAt),
  }
}

export async function getRecentBriefs(count = 14): Promise<MarketBrief[]> {
  const db = getFirestoreInstance()
  if (!db) return []
  try {
    const q = query(
      collection(db, 'marketBriefs'),
      orderBy('createdAt', 'desc'),
      limit(count)
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => docToBrief(d as Parameters<typeof docToBrief>[0]))
  } catch (error) {
    console.error('마켓 브리프 조회 오류:', error)
    return []
  }
}

export async function saveBrief(brief: Omit<MarketBrief, 'id'>): Promise<string> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore 초기화 실패')
  const ref = await addDoc(collection(db, 'marketBriefs'), {
    ...brief,
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromDate(brief.expiresAt),
  })
  return ref.id
}
