import { NextRequest } from 'next/server'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { getFirestoreInstance } from '@/lib/firebase/firestore'
import { calcCostUsd } from '@/lib/services/usage'

/**
 * 회사 전체 AI 사용량 집계 API
 * - 인증된 gfutures 계정만 호출 가능
 * - 개인별 상세 로그는 절대 반환하지 않음
 * - 집계 숫자(총 비용, 요청 수, 사용자 수)만 반환
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  // JWT에서 이메일 확인 (gfutures 계정만 허용)
  try {
    const token = authHeader.replace('Bearer ', '')
    const parts = token.split('.')
    if (parts.length !== 3) throw new Error('invalid token')
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))
    const email: string = payload.email ?? ''
    if (!email.endsWith('@gfutures.co')) {
      return Response.json({ error: '권한이 없습니다.' }, { status: 403 })
    }
  } catch {
    return Response.json({ error: '인증 실패' }, { status: 401 })
  }

  const db = getFirestoreInstance()
  if (!db) return Response.json({ error: 'DB 연결 실패' }, { status: 503 })

  try {
    const q = query(collection(db, 'aiUsageLogs'), orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)

    // ── 집계만 수행, 개인 데이터는 반환하지 않음 ──
    let totalRequests = 0
    let totalCostUsd = 0
    let thisMonthCostUsd = 0
    const userIds = new Set<string>()

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

    for (const d of snapshot.docs) {
      const data = d.data()
      const cost = data.costUsd ?? calcCostUsd(data.model, data.inputTokens ?? 0, data.outputTokens ?? 0)
      const createdAt: number = data.createdAt?.toMillis?.() ?? 0

      totalRequests += 1
      totalCostUsd += cost
      if (createdAt >= startOfMonth) thisMonthCostUsd += cost
      if (data.userId) userIds.add(data.userId)
    }

    return Response.json({
      totalRequests,
      totalCostUsd,
      thisMonthCostUsd,
      activeUsers: userIds.size,
    })
  } catch (err) {
    console.error('회사 통계 집계 오류:', err)
    return Response.json({ error: '집계 실패' }, { status: 500 })
  }
}
