import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import { getDocument, commitWrites } from '@/lib/server/firestoreRest'
import type { Campaign } from '@/types'
import type {
  CampaignMetaMapping,
  CampaignMetaInsightBreakdownType,
  CampaignMetaInsightLevel,
  CampaignMetaInsightSnapshot,
  CampaignMetaRefreshResult,
} from '@/types/campaignMeta'
import {
  normalizeMetaInsightRow,
  validateRefreshRequest,
} from '@/lib/campaigns/metaInsights'
import { normalizeMetaAdAccountId } from '@/lib/campaigns/metaAccount'

const META_API_BASE = 'https://graph.facebook.com/v20.0'

const INSIGHT_FIELDS: Record<CampaignMetaInsightLevel, string[]> = {
  campaign: [
    'campaign_id', 'campaign_name',
    'spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm',
    'video_play_actions', 'video_thruplay_watched_actions', 'actions',
  ],
  adset: [
    'adset_id', 'adset_name',
    'spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm',
    'video_play_actions', 'video_thruplay_watched_actions', 'actions',
  ],
  ad: [
    'ad_id', 'ad_name',
    'spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm',
    'video_play_actions', 'video_thruplay_watched_actions', 'actions',
  ],
}

const BREAKDOWN_FIELDS: Record<Exclude<CampaignMetaInsightBreakdownType, 'none'>, string[]> = {
  age_gender: [
    'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
    'age', 'gender',
    'spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm',
    'video_play_actions', 'video_thruplay_watched_actions', 'actions',
  ],
  placement: [
    'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
    'publisher_platform', 'platform_position',
    'spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm',
    'video_play_actions', 'video_thruplay_watched_actions', 'actions',
  ],
  hourly: [
    'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
    'hourly_stats_aggregated_by_advertiser_time_zone',
    'spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm',
    'video_play_actions', 'video_thruplay_watched_actions', 'actions',
  ],
}

const BREAKDOWN_PARAMS: Record<Exclude<CampaignMetaInsightBreakdownType, 'none'>, string> = {
  age_gender: 'age,gender',
  placement: 'publisher_platform,platform_position',
  hourly: 'hourly_stats_aggregated_by_advertiser_time_zone',
}

const LEVEL_ID_MAP: Record<CampaignMetaInsightLevel, keyof CampaignMetaMapping> = {
  campaign: 'metaCampaignIds',
  adset: 'metaAdsetIds',
  ad: 'metaAdIds',
}

async function fetchInsightPage(
  accountId: string,
  accessToken: string,
  level: CampaignMetaInsightLevel,
  dateStart: string,
  dateStop: string,
  filterIds: string[],
  breakdownType: CampaignMetaInsightBreakdownType,
  afterCursor?: string
): Promise<{ rows: Record<string, unknown>[]; nextCursor?: string }> {
  if (filterIds.length === 0) {
    throw new Error(`${level} refresh requires object ids`)
  }

  const fields =
    breakdownType === 'none'
      ? INSIGHT_FIELDS[level].join(',')
      : BREAKDOWN_FIELDS[breakdownType].join(',')

  const params = new URLSearchParams({
    access_token: accessToken,
    level,
    fields,
    time_range: JSON.stringify({ since: dateStart, until: dateStop }),
    time_increment: '1',
    limit: '100',
    filtering: JSON.stringify([{
      field: `${level}.id`,
      operator: 'IN',
      value: filterIds,
    }]),
  })

  if (breakdownType !== 'none') {
    params.set('breakdowns', BREAKDOWN_PARAMS[breakdownType])
  }
  if (afterCursor) params.set('after', afterCursor)

  const url = `${META_API_BASE}/${accountId}/insights?${params.toString()}`

  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    throw new Error(`Meta API network error: ${err instanceof Error ? err.message : String(err)}`)
  }

  let data: Record<string, unknown>
  try {
    data = (await res.json()) as Record<string, unknown>
  } catch {
    throw new Error(`Meta API response parse failed (HTTP ${res.status})`)
  }

  if (data['error']) {
    const metaErr = data['error'] as Record<string, unknown>
    const msg = (metaErr['message'] as string | undefined) ?? 'unknown error'
    const code = metaErr['code'] as number | undefined
    const subcode = metaErr['error_subcode'] as number | undefined
    const detail = subcode ? `[${code}/${subcode}]` : code ? `[${code}]` : ''
    throw new Error(`Meta API error ${detail}: ${msg}`)
  }

  if (!res.ok) {
    throw new Error(`Meta API HTTP error: ${res.status}`)
  }

  const rows = (data['data'] as Record<string, unknown>[] | undefined) ?? []
  const paging = data['paging'] as Record<string, unknown> | undefined
  const nextCursor = (paging?.['cursors'] as Record<string, unknown> | undefined)?.['after'] as
    | string
    | undefined

  return { rows, nextCursor }
}

async function fetchAllInsightRows(
  accountId: string,
  accessToken: string,
  level: CampaignMetaInsightLevel,
  dateStart: string,
  dateStop: string,
  filterIds: string[],
  breakdownType: CampaignMetaInsightBreakdownType
): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = []
  let cursor: string | undefined

  for (let page = 0; page < 20; page++) {
    const { rows, nextCursor } = await fetchInsightPage(
      accountId,
      accessToken,
      level,
      dateStart,
      dateStop,
      filterIds,
      breakdownType,
      cursor
    )
    allRows.push(...rows)
    if (!nextCursor || rows.length === 0) break
    cursor = nextCursor
  }

  return allRows
}

function resolveSubset(
  requested: string[] | undefined,
  allowed: string[],
  label: string
): string[] {
  if (!requested || requested.length === 0) return allowed
  const invalid = requested.filter((id) => !allowed.includes(id))
  if (invalid.length > 0) {
    throw new Error(`${label} contains unauthorized ids: ${invalid.join(', ')}`)
  }
  return requested
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
    return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const validation = validateRefreshRequest(rawBody)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const {
    mappingId,
    levels,
    dateStart,
    dateStop,
    metaCampaignIds,
    metaAdsetIds,
    metaAdIds,
  } = validation.data

  const metaAccountId = normalizeMetaAdAccountId(validation.data.metaAccountId)

  const mapping = await getDocument<CampaignMetaMapping>(
    auth.token,
    'campaignMetaMappings',
    mappingId
  )
  if (!mapping) {
    return NextResponse.json({ error: 'Mapping not found.' }, { status: 404 })
  }
  if (mapping.campaignId !== campaignId) {
    return NextResponse.json({ error: 'Mapping does not belong to campaign.' }, { status: 403 })
  }
  if (!mapping.enabled) {
    return NextResponse.json({ error: 'Mapping is disabled.' }, { status: 400 })
  }
  if (normalizeMetaAdAccountId(mapping.metaAccountId) !== metaAccountId) {
    return NextResponse.json({ error: 'metaAccountId does not match mapping.' }, { status: 400 })
  }

  const invalidLevels = levels.filter((lv) => !mapping.selectedLevels.includes(lv))
  if (invalidLevels.length > 0) {
    return NextResponse.json(
      { error: `Levels not allowed by mapping: ${invalidLevels.join(', ')}` },
      { status: 400 }
    )
  }

  const accessToken = process.env.META_ACCESS_TOKEN
  if (!accessToken) {
    return NextResponse.json({ error: 'META_ACCESS_TOKEN is not configured.' }, { status: 503 })
  }

  const bodyIdsByLevel: Record<CampaignMetaInsightLevel, string[] | undefined> = {
    campaign: metaCampaignIds,
    adset: metaAdsetIds,
    ad: metaAdIds,
  }

  const effectiveIdsByLevel: Partial<Record<CampaignMetaInsightLevel, string[]>> = {}
  for (const level of levels) {
    const mappingField = LEVEL_ID_MAP[level]
    const allowedIds = (mapping[mappingField] as string[]) ?? []
    if (allowedIds.length === 0) continue

    let resolvedIds: string[]
    try {
      resolvedIds = resolveSubset(bodyIdsByLevel[level], allowedIds, level)
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'id validation failed' },
        { status: 400 }
      )
    }

    if (resolvedIds.length > 0) {
      effectiveIdsByLevel[level] = resolvedIds
    }
  }

  const activeLevels = Object.keys(effectiveIdsByLevel) as CampaignMetaInsightLevel[]
  if (activeLevels.length === 0) {
    return NextResponse.json({ error: 'No eligible object ids for refresh.' }, { status: 400 })
  }

  const fetchedAt = new Date().toISOString()
  const snapshots: CampaignMetaInsightSnapshot[] = []
  let rawFetchedCount = 0
  let skippedCount = 0

  const runs: CampaignMetaInsightBreakdownType[] = ['none', 'age_gender', 'placement', 'hourly']
  for (const level of activeLevels) {
    const filterIds = effectiveIdsByLevel[level]!

    for (const breakdownType of runs) {
      let rows: Record<string, unknown>[]
      try {
        rows = await fetchAllInsightRows(
          metaAccountId,
          accessToken,
          level,
          dateStart,
          dateStop,
          filterIds,
          breakdownType
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Meta API error'
        console.error('Meta insights fetch error', {
          campaignId,
          mappingId,
          level,
          breakdownType,
          filterIdsCount: filterIds.length,
          error: msg,
        })
        return NextResponse.json(
          { error: 'Failed to fetch Meta insights.', detail: msg },
          { status: 502 }
        )
      }

      rawFetchedCount += rows.length

      for (const row of rows) {
        const snapshot = normalizeMetaInsightRow({
          campaignId,
          mappingId,
          metaAccountId,
          level,
          breakdownType,
          row,
          fetchedAt,
        })
        if (!snapshot.metaObjectId || !snapshot.dateStart || !snapshot.dateStop) {
          skippedCount++
          continue
        }
        snapshots.push(snapshot)
      }
    }
  }

  let upsertedCount = 0
  if (snapshots.length > 0) {
    const BATCH_SIZE = 500
    try {
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
            breakdownType: s.breakdownType ?? 'none',
            breakdownAge: s.breakdownAge ?? null,
            breakdownGender: s.breakdownGender ?? null,
            breakdownPublisherPlatform: s.breakdownPublisherPlatform ?? null,
            breakdownPlatformPosition: s.breakdownPlatformPosition ?? null,
            breakdownHour: s.breakdownHour ?? null,
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
            sourceHash: s.sourceHash ?? null,
          } as Record<string, unknown>,
        }))
        await commitWrites(auth.token, writes)
        upsertedCount += chunk.length
      }
    } catch (err) {
      console.error('snapshot upsert error:', err)
      return NextResponse.json({ error: 'Failed to persist snapshots.' }, { status: 500 })
    }
  }

  const result: CampaignMetaRefreshResult = {
    campaignId,
    metaAccountId,
    rawFetchedCount,
    fetchedCount: snapshots.length,
    upsertedCount,
    skippedCount,
    levels: activeLevels,
    dateStart,
    dateStop,
    fetchedAt,
  }

  return NextResponse.json(result)
}

