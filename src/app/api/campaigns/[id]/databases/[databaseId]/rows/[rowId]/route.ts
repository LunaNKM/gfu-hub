import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import { patchDocument, deleteDocument, getDocument } from '@/lib/server/firestoreRest'
import { CampaignDatabase } from '@/types'
import { CampaignDatabaseRow } from '@/types/campaignDatabase'
import { getCampaignOwnedResource } from '@/lib/server/campaignResourceAuth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; databaseId: string; rowId: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id, databaseId, rowId } = await params

  try {
    // campaign ownership 확인
    const database = await getCampaignOwnedResource<CampaignDatabase>(
      auth.token,
      'campaignDatabases',
      databaseId,
      id
    )
    if (database instanceof NextResponse) return database

    // row 존재 확인
    const row = await getDocument<CampaignDatabaseRow>(
      auth.token,
      'campaignDatabaseRows',
      rowId
    )
    if (!row || row.databaseId !== databaseId) {
      return NextResponse.json({ error: '행을 찾을 수 없습니다.' }, { status: 404 })
    }

    const body = await req.json()
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }

    // cells 업데이트 (부분 업데이트: body.cells의 키만 변경)
    if (body.cells && typeof body.cells === 'object') {
      const mergedCells = { ...row.cells, ...body.cells }
      patch.cells = mergedCells
    }
    if (typeof body.order === 'number') patch.order = body.order

    await patchDocument(auth.token, 'campaignDatabaseRows', rowId, patch)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('row 수정 오류:', err)
    return NextResponse.json({ error: '행을 수정할 수 없습니다.' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; databaseId: string; rowId: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id, databaseId, rowId } = await params

  try {
    const database = await getCampaignOwnedResource<CampaignDatabase>(
      auth.token,
      'campaignDatabases',
      databaseId,
      id
    )
    if (database instanceof NextResponse) return database

    const row = await getDocument<CampaignDatabaseRow>(
      auth.token,
      'campaignDatabaseRows',
      rowId
    )
    if (!row || row.databaseId !== databaseId) {
      return NextResponse.json({ error: '행을 찾을 수 없습니다.' }, { status: 404 })
    }

    await deleteDocument(auth.token, 'campaignDatabaseRows', rowId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('row 삭제 오류:', err)
    return NextResponse.json({ error: '행을 삭제할 수 없습니다.' }, { status: 500 })
  }
}
