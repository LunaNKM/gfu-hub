import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import {
  queryCollectionByField,
  createDocument,
} from '@/lib/server/firestoreRest'
import { CampaignSection } from '@/types'
import { createDefaultTableContent } from '@/lib/campaigns/databaseTemplates'

function defaultContent(type: string, title?: string) {
  if (type === 'document') return { blocks: [] }
  if (type === 'data_table') return createDefaultTableContent({ title })
  return { widgets: [] }
}

function defaultTitle(type: string) {
  if (type === 'document') return '새 문서'
  if (type === 'data_table') return '새 데이터 테이블'
  return '새 대시보드'
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
    const { type, title } = body as { type: string; title?: string }

    if (!['document', 'data_table', 'dashboard'].includes(type)) {
      return NextResponse.json({ error: '유효하지 않은 섹션 타입입니다.' }, { status: 400 })
    }

    const existing = await queryCollectionByField<CampaignSection>(
      auth.token,
      'campaignSections',
      'campaignId',
      id
    )
    const maxOrder = existing.reduce((m, s) => Math.max(m, s.order ?? 0), 0)

    const sectionTitle = title ?? defaultTitle(type)
    const now = new Date().toISOString()
    const data: Record<string, unknown> = {
      campaignId: id,
      title: sectionTitle,
      type,
      order: maxOrder + 1000,
      internalVisible: true,
      clientShareEnabled: false,
      clientEditable: false,
      content: defaultContent(type, sectionTitle),
      createdAt: now,
      updatedAt: now,
      createdBy: auth.uid,
      updatedBy: auth.uid,
    }

    const sectionId = await createDocument(auth.token, 'campaignSections', data)
    const section = { id: sectionId, ...data }

    return NextResponse.json({ section }, { status: 201 })
  } catch (err) {
    console.error('섹션 생성 오류:', err)
    return NextResponse.json({ error: '섹션을 생성할 수 없습니다.' }, { status: 500 })
  }
}
