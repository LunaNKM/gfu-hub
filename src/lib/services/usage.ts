import {
  collection,
  getDocs,
  addDoc,
  Timestamp,
  query,
  where,
} from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { AiUsageLog } from '@/types'

// ── 모델별 단가 (USD / 1M 토큰) ──────────────────────────────
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-5.4':              { input: 2.50,  output: 15.00 },
  'gpt-5.4-mini':         { input: 0.40,  output: 1.60  },
  'gpt-5.4-nano':         { input: 0.10,  output: 0.40  },
  'gpt-4.1':              { input: 2.00,  output: 8.00  },
  'gpt-4.1-mini':         { input: 0.40,  output: 1.60  },
  'gpt-4o':               { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':          { input: 0.15,  output: 0.60  },
  'text-embedding-3-small': { input: 0.02, output: 0.00 },
  'text-embedding-3-large': { input: 0.13, output: 0.00 },
}

// cachedTokens: OpenAI 자동 캐싱 적용 시 입력 토큰의 50% 할인
export function calcCostUsd(model: string, inputTokens: number, outputTokens: number, cachedTokens = 0): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-5.4']
  const uncachedInput = inputTokens - cachedTokens
  return (uncachedInput * pricing.input + cachedTokens * pricing.input * 0.5 + outputTokens * pricing.output) / 1_000_000
}

export function formatUsd(amount: number): string {
  if (amount < 0.001) return '$0.00'
  if (amount < 0.01) return `$${amount.toFixed(4)}`
  if (amount < 1) return `$${amount.toFixed(3)}`
  return `$${amount.toFixed(2)}`
}

function convertTimestamp(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate()
  if (ts instanceof Date) return ts
  return new Date()
}

// ── 로그 저장 ─────────────────────────────────────────────────
export async function logAiUsage(
  data: Omit<AiUsageLog, 'id' | 'createdAt' | 'costUsd'>
): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) return

  const costUsd = calcCostUsd(data.model, data.inputTokens, data.outputTokens, data.cachedTokens)

  try {
    await addDoc(collection(db, 'aiUsageLogs'), {
      ...data,
      costUsd,
      createdAt: Timestamp.now(),
    })
  } catch (error) {
    console.error('사용량 로그 저장 오류:', error)
  }
}

// ── 내 사용량 조회 ────────────────────────────────────────────
export async function getMyUsage(userId: string): Promise<AiUsageLog[]> {
  const db = getFirestoreInstance()
  if (!db) return []

  try {
    // orderBy를 Firestore 쿼리에서 제거 → 복합 인덱스 불필요
    // 정렬은 클라이언트에서 처리
    const q = query(
      collection(db, 'aiUsageLogs'),
      where('userId', '==', userId)
    )
    const snapshot = await getDocs(q)
    const logs = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      costUsd: d.data().costUsd ?? calcCostUsd(d.data().model, d.data().inputTokens ?? 0, d.data().outputTokens ?? 0),
      createdAt: convertTimestamp(d.data().createdAt),
    })) as AiUsageLog[]

    // 최신순 정렬
    return logs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  } catch (error) {
    console.error('사용량 조회 오류:', error)
    return []
  }
}

// ── 전체 사용량 조회 (회사 통계용) ───────────────────────────
export async function getAllUsage(): Promise<AiUsageLog[]> {
  const db = getFirestoreInstance()
  if (!db) return []

  try {
    const snapshot = await getDocs(collection(db, 'aiUsageLogs'))
    const logs = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      costUsd: d.data().costUsd ?? calcCostUsd(d.data().model, d.data().inputTokens ?? 0, d.data().outputTokens ?? 0),
      createdAt: convertTimestamp(d.data().createdAt),
    })) as AiUsageLog[]
    return logs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  } catch (error) {
    console.error('전체 사용량 조회 오류:', error)
    return []
  }
}

// ── 통계 계산 ─────────────────────────────────────────────────
export function computeStats(logs: AiUsageLog[]) {
  const totalRequests = logs.length
  const totalTokens = logs.reduce((s, l) => s + l.totalTokens, 0)
  const totalCostUsd = logs.reduce((s, l) => s + (l.costUsd ?? 0), 0)

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisMonthLogs = logs.filter((l) => l.createdAt >= startOfMonth)
  const thisMonthCostUsd = thisMonthLogs.reduce((s, l) => s + (l.costUsd ?? 0), 0)

  const byFeature: Record<string, number> = {}
  logs.forEach((l) => {
    byFeature[l.feature] = (byFeature[l.feature] || 0) + 1
  })

  // 사용자별 집계
  const byUser: Record<string, { email: string; requests: number; costUsd: number; tokens: number }> = {}
  logs.forEach((l) => {
    if (!byUser[l.userId]) {
      byUser[l.userId] = {
        email: l.userEmail ?? l.userId.slice(0, 8) + '...',
        requests: 0,
        costUsd: 0,
        tokens: 0,
      }
    }
    byUser[l.userId].requests += 1
    byUser[l.userId].costUsd += l.costUsd ?? 0
    byUser[l.userId].tokens += l.totalTokens
  })

  return { totalRequests, totalTokens, totalCostUsd, thisMonthCostUsd, byFeature, byUser }
}
