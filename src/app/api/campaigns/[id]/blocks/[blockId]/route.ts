import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import { patchDocument, deleteDocument } from '@/lib/server/firestoreRest'
import { getCampaignOwnedResource } from '@/lib/server/campaignResourceAuth'
import { CampaignBlock } from '@/types'

const PATCHABLE_FIELDS = [
  'type',
  'order',
  'content',
  'clientVisible',
  'clientEditable',
] as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id, blockId } = await params

  try {
    const block = await getCampaignOwnedResource<CampaignBlock>(auth.token, 'campaignBlocks', blockId, id)
    if (block instanceof NextResponse) return block

    const body = await req.json()
    const patch: Record<string, unknown> = {}

    for (const field of PATCHABLE_FIELDS) {
      if (field in body) patch[field] = body[field]
    }

    patch.updatedAt = new Date().toISOString()
    patch.updatedBy = auth.uid

    await patchDocument(auth.token, 'campaignBlocks', blockId, patch)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('block update error:', err)
    return NextResponse.json({ error: '블록을 수정할 수 없습니다.' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id, blockId } = await params

  try {
    const block = await getCampaignOwnedResource<CampaignBlock>(auth.token, 'campaignBlocks', blockId, id)
    if (block instanceof NextResponse) return block

    await deleteDocument(auth.token, 'campaignBlocks', blockId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('block delete error:', err)
    return NextResponse.json({ error: '블록을 삭제할 수 없습니다.' }, { status: 500 })
  }
}
