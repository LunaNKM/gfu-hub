import { NextRequest, NextResponse } from 'next/server'
import { getTrendSignals, saveTrendSignal } from '@/lib/services/intelligenceSignals'
import { isAuthResponse, requireAuth } from '@/lib/server/auth'
import { TrendSignal } from '@/types'

export async function GET(req: NextRequest) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  try {
    const signals = await getTrendSignals()
    return NextResponse.json({ signals })
  } catch (err) {
    console.error('트렌드 조회 오류:', err)
    return NextResponse.json({ error: '트렌드를 불러올 수 없습니다.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  try {
    const body = await req.json()
    const title = String(body.title ?? '').trim()
    if (!title) return NextResponse.json({ error: 'title이 필요합니다.' }, { status: 400 })

    const id = await saveTrendSignal({
      title,
      summary: String(body.summary ?? ''),
      market: 'JP',
      category: (body.category as TrendSignal['category']) ?? 'other',
      platforms: Array.isArray(body.platforms) ? body.platforms : [],
      relatedBrands: Array.isArray(body.relatedBrands) ? body.relatedBrands : [],
      relatedCompetitors: Array.isArray(body.relatedCompetitors) ? body.relatedCompetitors : [],
      impactScore: Number(body.impactScore ?? 60),
      confidenceScore: Number(body.confidenceScore ?? 60),
      sourceUrls: Array.isArray(body.sourceUrls) ? body.sourceUrls : [],
      observedAt: String(body.observedAt ?? new Date().toISOString().slice(0, 10)),
      savedBy: user.uid,
    })
    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    console.error('트렌드 저장 오류:', err)
    return NextResponse.json({ error: '트렌드를 저장할 수 없습니다.' }, { status: 500 })
  }
}

