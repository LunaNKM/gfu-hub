import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import { getDocument, commitWrites } from '@/lib/server/firestoreRest'
import type { Campaign } from '@/types'
import type {
  CampaignMetaMapping,
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

// Keep this list limited to valid Ads Insights API fields.
// `currency` is NOT a valid fields param for this endpoint — it causes HTTP 400.
const INSIGHT_FIELDS: Record<string, string[]> = {
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

// filterIds must be non-empty — prevents fetching entire ad account
async function fetchInsightPage(
  accountId: string,
  accessToken: string,
  level: string,
  dateStart: string,
  dateStop: string,
  filterIds: string[],
  afterCursor?: string
): Promise<{ rows: Record<string, unknown>[]; nextCursor?: string }> {
  if (filterIds.length === 0) {
    throw new Error(`${level} refresh에는 object id 필터가 필요합니다.`)
  }

  const fields = INSIGHT_FIELDS[level]?.join(',') ?? ''
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
  if (afterCursor) params.set('after', afterCursor)

  const url = `${META_API_BASE}/${accountId}/insights?${params.toString()}`

  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    throw new Error(`Meta API 네트워크 오류: ${err instanceof Error ? err.message : String(err)}`)
  }

  // JSON body를 먼저 파싱 — Meta는 4xx/5xx에도 항상 JSON error body를 반환하므로
  // !res.ok보다 먼저 읽어야 실제 오류 메시지를 얻을 수 있다
  let data: Record<string, unknown>
  try {
    data = (await res.json()) as Record<string, unknown>
  } catch {
    throw new Error(`Meta API 응답을 파싱할 수 없습니다. (HTTP ${res.status})`)
  }

  if (data['error']) {
    const metaErr = data['error'] as Record<string, unknown>
    const msg = (metaErr['message'] as string | undefined) ?? '알 수 없는 오류'
    const code = metaErr['code'] as number | undefined
    const subcode = metaErr['error_subcode'] as number | undefined
    const detail = subcode ? `[${code}/${subcode}]` : code ? `[${code}]` : ''
    throw new Error(`Meta API 오류 ${detail}: ${msg}`)
  }

  if (!res.ok) {
    throw new Error(`Meta API HTTP 오류: ${res.status}`)
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
  level: string,
  dateStart: string,
  dateStop: string,
  filterIds: string[]
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

// Returns requested ∩ allowed. If requested is empty, returns allowed.
// Throws if any requested id is not in allowed.
function resolveSubset(
  requested: string[] | undefined,
  allowed: string[],
  label: string
): string[] {
  if (!requested || requested.length === 0) return allowed
  const invalid = requested.filter((id) => !allowed.includes(id))
  if (invalid.length > 0) {
    throw new Error(`${label}에 허용되지 않은 id가 포함되어 있습니다: ${invalid.join(', ')}`)
  }
  return requested
}

const LEVEL_ID_MAP: Record<CampaignMetaInsightLevel, keyof CampaignMetaMapping> = {
  campaign: 'metaCampaignIds',
  adset: 'metaAdsetIds',
  ad: 'metaAdIds',
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

  const { mappingId, levels, dateStart, dateStop, metaCampaignIds, metaAdsetIds, metaAdIds } =
    validation.data
  // act_ prefix가 없을 경우를 대비해 정규화 — Meta API는 act_ 없이 요청하면 400을 반환한다
  const metaAccountId = normalizeMetaAdAccountId(validation.data.metaAccountId)

  // ── Mapping 검증 ──────────────────────────────────────────────────
  const mapping = await getDocument<CampaignMetaMapping>(
    auth.token,
    'campaignMetaMappings',
    mappingId
  )
  if (!mapping) {
    return NextResponse.json({ error: 'mapping을 찾을 수 없습니다.' }, { status: 404 })
  }
  if (mapping.campaignId !== campaignId) {
    return NextResponse.json({ error: '해당 캠페인의 mapping이 아닙니다.' }, { status: 403 })
  }
  if (!mapping.enabled) {
    return NextResponse.json({ error: 'mapping이 비활성화되어 있습니다.' }, { status: 400 })
  }
  if (normalizeMetaAdAccountId(mapping.metaAccountId) !== metaAccountId) {
    return NextResponse.json(
      { error: 'metaAccountId가 mapping과 일치하지 않습니다.' },
      { status: 400 }
    )
  }

  // levels는 mapping.selectedLevels의 subset이어야 함
  const invalidLevels = levels.filter((lv) => !mapping.selectedLevels.includes(lv))
  if (invalidLevels.length > 0) {
    return NextResponse.json(
      { error: `mapping에 포함되지 않은 level: ${invalidLevels.join(', ')}` },
      { status: 400 }
    )
  }

  const accessToken = process.env.META_ACCESS_TOKEN
  if (!accessToken) {
    return NextResponse.json({ error: 'META_ACCESS_TOKEN이 설정되지 않았습니다.' }, { status: 503 })
  }

  // ── level별 유효 ids 결정 ─────────────────────────────────────────
  const bodyIdsByLevel: Record<string, string[] | undefined> = {
    campaign: metaCampaignIds,
    adset: metaAdsetIds,
    ad: metaAdIds,
  }

  const effectiveIdsByLevel: Partial<Record<CampaignMetaInsightLevel, string[]>> = {}
  for (const level of levels) {
    const mappingField = LEVEL_ID_MAP[level]
    const allowedIds = (mapping[mappingField] as string[]) ?? []

    if (allowedIds.length === 0) {
      // mapping에 해당 level의 id가 없으므로 skip
      continue
    }

    let resolvedIds: string[]
    try {
      resolvedIds = resolveSubset(bodyIdsByLevel[level], allowedIds, level)
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'id 검증 오류' },
        { status: 400 }
      )
    }

    if (resolvedIds.length > 0) {
      effectiveIdsByLevel[level] = resolvedIds
    }
  }

  const activeLevels = Object.keys(effectiveIdsByLevel) as CampaignMetaInsightLevel[]
  if (activeLevels.length === 0) {
    return NextResponse.json(
      { error: 'refresh 가능한 object id가 없습니다. mapping에 id를 먼저 등록하세요.' },
      { status: 400 }
    )
  }

  // ── Meta API fetch ────────────────────────────────────────────────
  const fetchedAt = new Date().toISOString()
  const snapshots: CampaignMetaInsightSnapshot[] = []
  let rawFetchedCount = 0
  let skippedCount = 0

  for (const level of activeLevels) {
    const filterIds = effectiveIdsByLevel[level]!
    let rows: Record<string, unknown>[]
    try {
      rows = await fetchAllInsightRows(
        metaAccountId, accessToken, level, dateStart, dateStop, filterIds
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Meta API 오류'
      // access_token과 전체 URL은 절대 로그에 포함하지 않음
      console.error('Meta insights fetch 오류', {
        campaignId,
        mappingId,
        level,
        filterIdsCount: filterIds.length,
        error: msg,
      })
      return NextResponse.json(
        { error: 'Meta insights를 불러오지 못했습니다.', detail: msg },
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

  // ── Firestore upsert ──────────────────────────────────────────────
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
      console.error('snapshot upsert 오류:', err)
      return NextResponse.json({ error: 'snapshot 저장 중 오류가 발생했습니다.' }, { status: 500 })
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
