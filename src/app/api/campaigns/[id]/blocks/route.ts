import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import { queryCollectionByField, createDocument } from '@/lib/server/firestoreRest'
import { CampaignBlock, CampaignBlockType } from '@/types'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id } = await params

  try {
    const blocks = await queryCollectionByField<CampaignBlock>(
      auth.token,
      'campaignBlocks',
      'campaignId',
      id
    )
    const sorted = [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    return NextResponse.json({ blocks: sorted })
  } catch (err) {
    console.error('blocks 조회 오류:', err)
    return NextResponse.json({ error: '블록을 불러올 수 없습니다.' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id } = await params

  try {
    const body = await req.json()
    const { sectionId, type, order, content } = body as {
      sectionId: string
      type: CampaignBlockType
      order?: number
      content?: Record<string, unknown>
    }

    if (!sectionId || !type) {
      return NextResponse.json({ error: 'sectionId와 type이 필요합니다.' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const data: Record<string, unknown> = {
      campaignId: id,
      sectionId,
      type,
      order: order ?? 1000,
      content: content ?? {},
      clientVisible: true,
      clientEditable: false,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.uid,
      updatedBy: auth.uid,
    }

    const blockId = await createDocument(auth.token, 'campaignBlocks', data)
    const block = { id: blockId, ...data }

    return NextResponse.json({ block }, { status: 201 })
  } catch (err) {
    console.error('block 생성 오류:', err)
    return NextResponse.json({ error: '블록을 생성할 수 없습니다.' }, { status: 500 })
  }
}
