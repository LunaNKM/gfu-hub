import { NextRequest, NextResponse } from 'next/server'
import { isAuthResponse, requireAuth } from '@/lib/server/auth'
import { createDocument, listCollection, patchDocument } from '@/lib/server/firestoreRest'
import { CompetitorWatch } from '@/types'

export async function GET(req: NextRequest) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  try {
    const watches = await listCollection<CompetitorWatch>(user.token, 'competitorWatches')
    watches.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    return NextResponse.json({ watches })
  } catch (err) {
    console.error('경쟁사 모니터링 조회 오류:', err)
    return NextResponse.json({ error: '경쟁사 모니터링을 불러올 수 없습니다.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  try {
    const body = await req.json()
    const id = await createDocument(user.token, 'competitorWatches', {
      brandName: String(body.brandName ?? ''),
      competitorName: String(body.competitorName ?? ''),
      keywords: Array.isArray(body.keywords) ? body.keywords : [],
      platforms: Array.isArray(body.platforms) ? body.platforms : [],
      active: body.active ?? true,
      lastCheckedAt: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    console.error('경쟁사 모니터링 생성 오류:', err)
    return NextResponse.json({ error: '경쟁사 모니터링을 생성할 수 없습니다.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  try {
    const body = await req.json()
    if (!body.id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
    await patchDocument(user.token, 'competitorWatches', String(body.id), {
      ...body,
      updatedAt: new Date(),
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('경쟁사 모니터링 수정 오류:', err)
    return NextResponse.json({ error: '경쟁사 모니터링을 수정할 수 없습니다.' }, { status: 500 })
  }
}
