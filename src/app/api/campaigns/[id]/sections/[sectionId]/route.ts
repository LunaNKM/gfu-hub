import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import { patchDocument, deleteDocument } from '@/lib/server/firestoreRest'
import { getCampaignOwnedResource } from '@/lib/server/campaignResourceAuth'
import { CampaignSection } from '@/types'

type Params = Promise<{ id: string; sectionId: string }>

const PATCHABLE_FIELDS = [
  'title',
  'order',
  'internalVisible',
  'clientShareEnabled',
  'clientEditable',
  'crmSyncType',
  'content',
] as const

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id, sectionId } = await params

  try {
    const section = await getCampaignOwnedResource<CampaignSection>(auth.token, 'campaignSections', sectionId, id)
    if (section instanceof NextResponse) return section

    const body = await req.json()
    const patch: Record<string, unknown> = {}
    for (const key of PATCHABLE_FIELDS) {
      if (key in body) patch[key] = body[key]
    }
    patch.updatedAt = new Date().toISOString()
    patch.updatedBy = auth.uid

    await patchDocument(auth.token, 'campaignSections', sectionId, patch)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('section update error:', err)
    return NextResponse.json({ error: '섹션을 수정할 수 없습니다.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id, sectionId } = await params

  try {
    const section = await getCampaignOwnedResource<CampaignSection>(auth.token, 'campaignSections', sectionId, id)
    if (section instanceof NextResponse) return section

    await deleteDocument(auth.token, 'campaignSections', sectionId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('section delete error:', err)
    return NextResponse.json({ error: '섹션을 삭제할 수 없습니다.' }, { status: 500 })
  }
}
