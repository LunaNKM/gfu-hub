/**
 * 일본 시장 인텔리전스 피드 생성
 *
 * GET  → Vercel Cron (Authorization: Bearer CRON_SECRET)
 * POST → 수동 트리거 (Authorization: Bearer {uid})
 *
 * 매일 UTC 01:00 (JST 10:00) 실행
 */

import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, getApps } from 'firebase/app'
import { getFirestore, collection, addDoc, Timestamp } from 'firebase/firestore'
import { generateDailyBrief } from '@/lib/intelligence/generateBrief'

// ── Firebase 초기화 (서버사이드) ───────────────────────────────
function getDb() {
  const existing = getApps().find((a) => a.name === '[DEFAULT]') ?? getApps()[0]
  const app =
    existing ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    })
  return getFirestore(app)
}

// ── 인증 확인 ─────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  const h = req.headers.get('Authorization')
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return false
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && token === cronSecret) return true
  return token.length > 0
}

// ── 공통 저장 로직 ────────────────────────────────────────────
async function runAndSave() {
  const brief = await generateDailyBrief()
  const db = getDb()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const ref = await addDoc(collection(db, 'marketBriefs'), {
    ...brief,
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromDate(expiresAt),
  })

  return { id: ref.id, date: brief.date, topicsCount: brief.topics.length }
}

// ── GET: Vercel Cron 진입점 ───────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  try {
    const result = await runAndSave()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('브리핑 생성 오류:', err)
    return NextResponse.json({ error: '브리핑 생성 실패' }, { status: 500 })
  }
}

// ── POST: 수동 트리거 (UI에서 호출) ──────────────────────────
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  try {
    const result = await runAndSave()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('브리핑 생성 오류:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '브리핑 생성 실패' },
      { status: 500 }
    )
  }
}
