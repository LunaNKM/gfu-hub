import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import {
  getDocument,
  queryCollectionByField,
  createDocument,
  patchDocument,
} from '@/lib/server/firestoreRest'
import type { Campaign } from '@/types'
import type {
  CampaignMetaMapping,
  CampaignMetaInsightLevel,
} from '@/types/campaignMeta'

const VALID_LEVELS: CampaignMetaInsightLevel[] = ['campaign', 'adset', 'ad']

// Ensures value is a deduped, non-empty-string-only array
function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    ),
  ]
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id } = await params

  const campaign = await getDocument<Campaign>(auth.token, 'campaigns', id)
  if (!campaign) {
    return NextResponse.json({ error: '캠페인을 찾을 수 없습니다.' }, { status: 404 })
  }

  try {
    const mappings = await queryCollectionByField<CampaignMetaMapping>(
      auth.token,
      'campaignMetaMappings',
      'campaignId',
      id
    )
    const enabled = mappings.filter((m) => m.enabled)
    return NextResponse.json({ mappings: enabled })
  } catch (err) {
    console.error('meta mapping 조회 오류:', err)
    return NextResponse.json({ error: 'mapping을 불러올 수 없습니다.' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id } = await params

  const campaign = await getDocument<Campaign>(auth.token, 'campaigns', id)
  if (!campaign) {
    return NextResponse.json({ error: '캠페인을 찾을 수 없습니다.' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '유효하지 않은 요청 body입니다.' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'body가 필요합니다.' }, { status: 400 })
  }

  const b = body as Record<string, unknown>

  if (typeof b['metaAccountId'] !== 'string' || !b['metaAccountId'].trim()) {
    return NextResponse.json({ error: 'metaAccountId가 필요합니다.' }, { status: 400 })
  }

  if (!Array.isArray(b['selectedLevels']) || b['selectedLevels'].length === 0) {
    return NextResponse.json({ error: 'selectedLevels가 필요합니다.' }, { status: 400 })
  }
  const selectedLevels = (b['selectedLevels'] as unknown[]).filter(
    (lv): lv is CampaignMetaInsightLevel => VALID_LEVELS.includes(lv as CampaignMetaInsightLevel)
  )
  if (selectedLevels.length === 0) {
    return NextResponse.json({ error: '유효한 selectedLevels 값이 없습니다.' }, { status: 400 })
  }

  const metaCampaignIds = stringArray(b['metaCampaignIds'])
  const metaAdsetIds = stringArray(b['metaAdsetIds'])
  const metaAdIds = stringArray(b['metaAdIds'])

  const now = new Date().toISOString()
  const existingMappingId = typeof b['mappingId'] === 'string' ? b['mappingId'] : undefined

  try {
    if (existingMappingId) {
      const existing = await getDocument<CampaignMetaMapping>(
        auth.token,
        'campaignMetaMappings',
        existingMappingId
      )
      if (!existing || existing.campaignId !== id) {
        return NextResponse.json({ error: 'mapping을 찾을 수 없습니다.' }, { status: 404 })
      }

      const updateData: Record<string, unknown> = {
        metaAccountId: b['metaAccountId'],
        selectedLevels,
        metaCampaignIds,
        metaAdsetIds,
        metaAdIds,
        enabled: b['enabled'] !== false,
        updatedAt: now,
      }
      await patchDocument(auth.token, 'campaignMetaMappings', existingMappingId, updateData)
      return NextResponse.json({ mappingId: existingMappingId })
    }

    const data: Record<string, unknown> = {
      campaignId: id,
      metaAccountId: b['metaAccountId'],
      selectedLevels,
      metaCampaignIds,
      metaAdsetIds,
      metaAdIds,
      enabled: b['enabled'] !== false,
      createdAt: now,
      updatedAt: now,
    }
    const mappingId = await createDocument(auth.token, 'campaignMetaMappings', data)
    return NextResponse.json({ mappingId }, { status: 201 })
  } catch (err) {
    console.error('meta mapping 저장 오류:', err)
    return NextResponse.json({ error: 'mapping을 저장할 수 없습니다.' }, { status: 500 })
  }
}
