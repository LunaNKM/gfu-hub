import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import { getDocument, commitWrites } from '@/lib/server/firestoreRest'
import type { Campaign } from '@/types'
import type { CampaignMetaInsightSnapshot, CampaignMetaRefreshResult } from '@/types/campaignMeta'
import {
  normalizeMetaInsightRow,
  validateRefreshRequest,
} from '@/lib/campaigns/metaInsights'

const META_API_BASE = 'https://graph.facebook.com/v20.0'

const INSIGHT_FIELDS: Record<string, string[]> = {
  campaign: [
    'campaign_id', 'campaign_name',
    'spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm',
    'video_play_actions', 'video_thruplay_watched_actions', 'actions',
    'currency',
  ],
  adset: [
    'adset_id', 'adset_name',
    'spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm',
    'video_play_actions', 'video_thruplay_watched_actions', 'actions',
    'currency',
  ],
  ad: [
    'ad_id', 'ad_name',
    'spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm',
    'video_play_actions', 'video_thruplay_watched_actions', 'actions',
    'currency',
  ],
}

async function fetchInsightPage(
  accountId: string,
  accessToken: string,
  level: string,
  dateStart: string,
  dateStop: string,
  filterIds: string[] | undefined,
  afterCursor?: string
): Promise<{ rows: Record<string, unknown>[]; nextCursor?: string }> {
  const fields = INSIGHT_FIELDS[level]?.join(',') ?? ''
  const params = new URLSearchParams({
    access_token: accessToken,
    level,
    fields,
    time_range: JSON.stringify({ since: dateStart, until: dateStop }),
    time_increment: '1',
    limit: '100',
  })

  if (filterIds && filterIds.length > 0) {
    params.set('filtering', JSON.stringify([{
      field: `${level}.id`,
      operator: 'IN',
      value: filterIds,
    }]))
  }

  if (afterCursor) {
    params.set('after', afterCursor)
  }

  const url = `${META_API_BASE}/${accountId}/insights?${params.toString()}`
  let data: Record<string, unknown>
  try {
    const res = await fetch(url)
    data = await res.json() as Record<string, unknown>
  } catch {
    return { rows: [] }
  }

  if (data['error']) return { rows: [] }

  const rows = (data['data'] as Record<string, unknown>[] | undefined) ?? []
  const paging = data['paging'] as Record<string, unknown> | undefined
  const nextCursor = (paging?.['cursors'] as Record<string, unknown> | undefined)?.['after'] as string | undefined

  return { rows, nextCursor }
}

async function fetchAllInsightRows(
  accountId: string,
  accessToken: string,
  level: string,
  dateStart: string,
  dateStop: string,
  filterIds: string[] | undefined
): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = []
  let cursor: string | undefined = undefined

  for (let page = 0; page < 20; page++) {
    const { rows, nextCursor } = await fetchInsightPage(
      accountId, accessToken, level, dateStart, dateStop, filterIds, cursor
    )
    allRows.push(...rows)
    if (!nextCursor || rows.length === 0) break
    cursor = nextCursor
  }

  return allRows
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id: campaignId } = await params

  const campaign = await getDocument<Campaign>(auth.token, 'campaigns', campaignId)
  if (!campaign) {
    return NextResponse.json({ error: '캠페인을 찾을 수 없습니다.' }, { status: 404 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: '유효하지 않은 요청 body입니다.' }, { status: 400 })
  }

  const validation = validateRefreshRequest(rawBody)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const { metaAccountId, mappingId, levels, dateStart, dateStop, metaCampaignIds, metaAdsetIds, metaAdIds } =
    validation.data

  const accessToken = process.env.META_ACCESS_TOKEN
  if (!accessToken) {
    return NextResponse.json({ error: 'META_ACCESS_TOKEN이 설정되지 않았습니다.' }, { status: 503 })
  }

  const fetchedAt = new Date().toISOString()
  const snapshots: CampaignMetaInsightSnapshot[] = []

  const filterIdsByLevel: Record<string, string[] | undefined> = {
    campaign: metaCampaignIds,
    adset: metaAdsetIds,
    ad: metaAdIds,
  }

  for (const level of levels) {
    const rows = await fetchAllInsightRows(
      metaAccountId,
      accessToken,
      level,
      dateStart,
      dateStop,
      filterIdsByLevel[level]
    )

    for (const row of rows) {
      const snapshot = normalizeMetaInsightRow({
        campaignId,
        mappingId,
        metaAccountId,
        level,
        row,
        fetchedAt,
      })
      // skip rows with no metaObjectId (malformed response)
      if (!snapshot.metaObjectId) continue
      snapshots.push(snapshot)
    }
  }

  const fetchedCount = snapshots.length
  let upsertedCount = 0

  if (snapshots.length > 0) {
    // batch upsert in chunks of 500 (Firestore commit limit)
    const BATCH_SIZE = 500
    for (let i = 0; i < snapshots.length; i += BATCH_SIZE) {
      const chunk = snapshots.slice(i, i + BATCH_SIZE)
      const writes = chunk.map((s) => ({
        type: 'upsert' as const,
        collection: 'campaignMetaInsightSnapshots',
        documentId: s.id,
        data: {
          campaignId: s.campaignId,
          mappingId: s.mappingId ?? null,
          metaAccountId: s.metaAccountId,
          level: s.level,
          metaObjectId: s.metaObjectId,
          metaObjectName: s.metaObjectName,
          dateStart: s.dateStart,
          dateStop: s.dateStop,
          spend: s.spend,
          impressions: s.impressions,
          reach: s.reach,
          clicks: s.clicks,
          ctr: s.ctr,
          cpc: s.cpc,
          cpm: s.cpm,
          conversions: s.conversions,
          videoPlay: s.videoPlay,
          thruPlay: s.thruPlay,
          currency: s.currency ?? null,
          fetchedAt: s.fetchedAt,
        } as Record<string, unknown>,
      }))
      await commitWrites(auth.token, writes)
      upsertedCount += chunk.length
    }
  }

  const result: CampaignMetaRefreshResult = {
    campaignId,
    metaAccountId,
    fetchedCount,
    upsertedCount,
    skippedCount: fetchedCount - upsertedCount,
    levels,
    dateStart,
    dateStop,
    fetchedAt,
  }

  return NextResponse.json(result)
}
