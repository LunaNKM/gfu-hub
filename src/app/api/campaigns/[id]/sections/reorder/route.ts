import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import { patchDocument } from '@/lib/server/firestoreRest'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  await params

  try {
    const body = await req.json()
    const { sectionIds } = body as { sectionIds: string[] }

    if (!Array.isArray(sectionIds)) {
      return NextResponse.json({ error: 'sectionIds는 배열이어야 합니다.' }, { status: 400 })
    }

    const now = new Date().toISOString()
    await Promise.all(
      sectionIds.map((sectionId, i) =>
        patchDocument(auth.token, 'campaignSections', sectionId, {
          order: (i + 1) * 1000,
          updatedAt: now,
          updatedBy: auth.uid,
        })
      )
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('섹션 순서 변경 오류:', err)
    return NextResponse.json({ error: '순서를 변경할 수 없습니다.' }, { status: 500 })
  }
}
