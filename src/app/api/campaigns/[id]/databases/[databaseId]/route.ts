import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import { getDocument, patchDocument, deleteDocument } from '@/lib/server/firestoreRest'
import { CampaignDatabase } from '@/types'

const PATCHABLE_FIELDS = [
  'title',
  'businessType',
  'order',
  'columns',
  'rows',
  'clientVisible',
  'clientEditable',
] as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; databaseId: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { databaseId } = await params

  try {
    const body = await req.json()
    const patch: Record<string, unknown> = {}

    for (const field of PATCHABLE_FIELDS) {
      if (field in body) patch[field] = body[field]
    }

    patch.updatedAt = new Date().toISOString()
    patch.updatedBy = auth.uid

    await patchDocument(auth.token, 'campaignDatabases', databaseId, patch)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('database 수정 오류:', err)
    return NextResponse.json({ error: '데이터베이스를 수정할 수 없습니다.' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; databaseId: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id, databaseId } = await params

  try {
    // campaignId 확인
    const db = await getDocument<CampaignDatabase>(auth.token, 'campaignDatabases', databaseId)
    if (!db || db.campaignId !== id) {
      return NextResponse.json({ error: '데이터베이스를 찾을 수 없습니다.' }, { status: 404 })
    }

    await deleteDocument(auth.token, 'campaignDatabases', databaseId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('database 삭제 오류:', err)
    return NextResponse.json({ error: '데이터베이스를 삭제할 수 없습니다.' }, { status: 500 })
  }
}
