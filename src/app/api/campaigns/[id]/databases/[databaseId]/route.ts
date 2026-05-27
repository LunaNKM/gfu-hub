import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import { patchDocument, deleteDocument } from '@/lib/server/firestoreRest'
import { getCampaignOwnedResource } from '@/lib/server/campaignResourceAuth'
import { CampaignDatabase } from '@/types'

const PATCHABLE_FIELDS = [
  'title',
  'businessType',
  'order',
  'columns',
  'rows',
  'rowCount',
  'clientVisible',
  'clientEditable',
] as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; databaseId: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id, databaseId } = await params

  try {
    const database = await getCampaignOwnedResource<CampaignDatabase>(auth.token, 'campaignDatabases', databaseId, id)
    if (database instanceof NextResponse) return database

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
    console.error('database update error:', err)
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
    const database = await getCampaignOwnedResource<CampaignDatabase>(auth.token, 'campaignDatabases', databaseId, id)
    if (database instanceof NextResponse) return database

    await deleteDocument(auth.token, 'campaignDatabases', databaseId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('database delete error:', err)
    return NextResponse.json({ error: '데이터베이스를 삭제할 수 없습니다.' }, { status: 500 })
  }
}
