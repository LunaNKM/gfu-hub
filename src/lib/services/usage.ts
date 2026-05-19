import {
  collection,
  getDocs,
  addDoc,
  Timestamp,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { AiUsageLog } from '@/types'

function convertTimestamp(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate()
  if (ts instanceof Date) return ts
  return new Date()
}

export async function logAiUsage(data: Omit<AiUsageLog, 'id' | 'createdAt'>): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) return

  try {
    await addDoc(collection(db, 'aiUsageLogs'), {
      ...data,
      createdAt: Timestamp.now(),
    })
  } catch (error) {
    console.error('사용량 로그 저장 오류:', error)
  }
}

export async function getMyUsage(userId: string): Promise<AiUsageLog[]> {
  const db = getFirestoreInstance()
  if (!db) return []

  try {
    const q = query(
      collection(db, 'aiUsageLogs'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    )
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: convertTimestamp(d.data().createdAt),
    })) as AiUsageLog[]
  } catch (error) {
    console.error('사용량 조회 오류:', error)
    return []
  }
}

export async function getUsageStats(
  userId: string
): Promise<{ totalRequests: number; totalTokens: number; byFeature: Record<string, number> }> {
  const logs = await getMyUsage(userId)

  const totalRequests = logs.length
  const totalTokens = logs.reduce((sum, log) => sum + log.totalTokens, 0)
  const byFeature: Record<string, number> = {}

  logs.forEach((log) => {
    byFeature[log.feature] = (byFeature[log.feature] || 0) + 1
  })

  return { totalRequests, totalTokens, byFeature }
}
