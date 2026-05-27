import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import {
  getDocument,
  queryCollectionByField,
  createDocument,
} from '@/lib/server/firestoreRest'
import { Campaign, CampaignSection } from '@/types'

function sortSections(sections: CampaignSection[]): CampaignSection[] {
  return [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

function defaultContent(type: string) {
  if (type === 'document') return { blocks: [] }
  if (type === 'data_table') return { columns: [], rows: [] }
  return { widgets: [] }
}

async function createDefaultSections(
  token: string,
  campaignId: string,
  userId: string
): Promise<CampaignSection[]> {
  const defaults: { title: string; type: string; crmSyncType?: string }[] = [
    { title: '전략 개요', type: 'document' },
    { title: '후보자 리스트', type: 'data_table' },
    { title: '확정 인원 리스트', type: 'data_table', crmSyncType: 'confirmed_influencers' },
    { title: '인플루언서 성과', type: 'data_table', crmSyncType: 'influencer_performance' },
    { title: '대시보드', type: 'dashboard' },
  ]

  const created: CampaignSection[] = []
  for (let i = 0; i < defaults.length; i++) {
    const def = defaults[i]
    const now = new Date().toISOString()
    const data: Record<string, unknown> = {
      campaignId,
      title: def.title,
      type: def.type,
      order: (i + 1) * 1000,
      internalVisible: true,
      clientShareEnabled: false,
      clientEditable: false,
      content: defaultContent(def.type),
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
    }
    if (def.crmSyncType) data.crmSyncType = def.crmSyncType

    const id = await createDocument(token, 'campaignSections', data)
    created.push({ id, ...data } as unknown as CampaignSection)
  }
  return created
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id } = await params

  try {
    const campaign = await getDocument<Campaign>(auth.token, 'campaigns', id)
    if (!campaign) {
      return NextResponse.json({ error: '캠페인을 찾을 수 없습니다.' }, { status: 404 })
    }

    let sections = sortSections(await queryCollectionByField<CampaignSection>(
      auth.token,
      'campaignSections',
      'campaignId',
      id
    ))

    if (sections.length === 0) {
      sections = await createDefaultSections(auth.token, id, auth.uid)
    }

    return NextResponse.json({ campaign, sections })
  } catch (err) {
    console.error('workspace 조회 오류:', err)
    return NextResponse.json({ error: '워크스페이스를 불러올 수 없습니다.' }, { status: 500 })
  }
}
