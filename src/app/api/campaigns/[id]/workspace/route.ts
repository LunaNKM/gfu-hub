import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import {
  getDocument,
  queryCollectionByField,
  createDocument,
} from '@/lib/server/firestoreRest'
import { Campaign, CampaignSection, CampaignBlock, CampaignDatabase, CampaignCrmSyncType } from '@/types'
import { createDefaultTableContent } from '@/components/campaigns/workspace/dataTableTemplates'
import {
  createDefaultDatabase,
  DEFAULT_DATABASE_TYPES,
} from '@/lib/campaigns/databaseTemplates'
import { buildCampaignOverview } from '@/lib/campaigns/overview'

function sortByOrder<T extends { order?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

function defaultSectionContent(
  type: string,
  params?: { title?: string; crmSyncType?: CampaignCrmSyncType }
) {
  if (type === 'document') return { blocks: [] }
  if (type === 'data_table') return createDefaultTableContent(params ?? {})
  return { widgets: [] }
}

async function createDefaultSections(
  token: string,
  campaignId: string,
  userId: string
): Promise<CampaignSection[]> {
  const defaults: { title: string; type: string; crmSyncType?: CampaignCrmSyncType }[] = [
    { title: '전략 개요', type: 'document' },
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
      content: defaultSectionContent(def.type, {
        title: def.title,
        crmSyncType: def.crmSyncType,
      }),
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

async function createDefaultDatabases(
  token: string,
  campaignId: string,
  userId: string
): Promise<CampaignDatabase[]> {
  const created: CampaignDatabase[] = []
  for (let i = 0; i < DEFAULT_DATABASE_TYPES.length; i++) {
    const businessType = DEFAULT_DATABASE_TYPES[i]
    const data = createDefaultDatabase({
      campaignId,
      businessType,
      order: (i + 1) * 1000,
      userId,
    })
    const id = await createDocument(
      token,
      'campaignDatabases',
      data as unknown as Record<string, unknown>
    )
    created.push({ id, ...data })
  }
  return created
}

async function createDefaultBlock(
  token: string,
  campaignId: string,
  sectionId: string,
  userId: string
): Promise<CampaignBlock> {
  const now = new Date().toISOString()
  const data: Record<string, unknown> = {
    campaignId,
    sectionId,
    type: 'paragraph',
    order: 1000,
    content: { text: '' },
    clientVisible: true,
    clientEditable: false,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId,
  }
  const id = await createDocument(token, 'campaignBlocks', data)
  return { id, ...data } as unknown as CampaignBlock
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

    // sections 조회 (기존 campaignSections)
    let sections = sortByOrder(
      await queryCollectionByField<CampaignSection>(auth.token, 'campaignSections', 'campaignId', id)
    )
    if (sections.length === 0) {
      sections = await createDefaultSections(auth.token, id, auth.uid)
    }

    // blocks 조회
    let blocks = sortByOrder(
      await queryCollectionByField<CampaignBlock>(auth.token, 'campaignBlocks', 'campaignId', id)
    )
    // 섹션이 있는데 블록이 없으면 기본 블록 생성 (첫 번째 document 섹션)
    if (blocks.length === 0) {
      const docSection = sections.find((s) => s.type === 'document')
      if (docSection) {
        const block = await createDefaultBlock(auth.token, id, docSection.id, auth.uid)
        blocks = [block]
      }
    }

    // databases 조회
    let databases = sortByOrder(
      await queryCollectionByField<CampaignDatabase>(auth.token, 'campaignDatabases', 'campaignId', id)
    )
    if (databases.length === 0) {
      databases = await createDefaultDatabases(auth.token, id, auth.uid)
    }

    // overview 계산
    const overview = buildCampaignOverview(databases)

    return NextResponse.json({ campaign, sections, blocks, databases, overview })
  } catch (err) {
    console.error('workspace 조회 오류:', err)
    return NextResponse.json({ error: '워크스페이스를 불러올 수 없습니다.' }, { status: 500 })
  }
}
