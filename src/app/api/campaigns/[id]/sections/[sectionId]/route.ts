import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import { patchDocument, deleteDocument } from '@/lib/server/firestoreRest'

type Params = Promise<{ id: string; sectionId: string }>

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { sectionId } = await params

  try {
    const body = await req.json()
    const allowed = [
      'title',
      'order',
      'internalVisible',
      'clientShareEnabled',
      'clientEditable',
      'crmSyncType',
      'content',
    ]
    const patch: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) patch[key] = body[key]
    }
    patch.updatedAt = new Date().toISOString()
    patch.updatedBy = auth.uid

    await patchDocument(auth.token, 'campaignSections', sectionId, patch)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('섹션 수정 오류:', err)
    return NextResponse.json({ error: '섹션을 수정할 수 없습니다.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { sectionId } = await params

  try {
    await deleteDocument(auth.token, 'campaignSections', sectionId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('섹션 삭제 오류:', err)
    return NextResponse.json({ error: '섹션을 삭제할 수 없습니다.' }, { status: 500 })
  }
}
