import crypto from 'crypto'
import type {
  CampaignMetaInsightBreakdownType,
  CampaignMetaInsightLevel,
  CampaignMetaInsightSnapshot,
  CampaignMetaRefreshRequest,
} from '@/types/campaignMeta'

// ── ID sanitization ───────────────────────────────────────────────

function sanitizeForDocId(value: string): string {
  return value.replace(/[/\\. #[\]]/g, '_')
}

export function createMetaInsightSnapshotId(
  snapshot: Pick<
    CampaignMetaInsightSnapshot,
    | 'campaignId'
    | 'metaAccountId'
    | 'level'
    | 'metaObjectId'
    | 'dateStart'
    | 'dateStop'
    | 'breakdownType'
    | 'breakdownAge'
    | 'breakdownGender'
    | 'breakdownPublisherPlatform'
    | 'breakdownPlatformPosition'
    | 'breakdownHour'
  >
): string {
  const breakdownParts = [
    snapshot.breakdownType ?? 'none',
    snapshot.breakdownAge ?? '',
    snapshot.breakdownGender ?? '',
    snapshot.breakdownPublisherPlatform ?? '',
    snapshot.breakdownPlatformPosition ?? '',
    snapshot.breakdownHour?.toString() ?? '',
  ]
  const parts = [
    'metaInsight',
    snapshot.campaignId,
    snapshot.metaAccountId,
    snapshot.level,
    snapshot.metaObjectId,
    snapshot.dateStart,
    snapshot.dateStop,
    ...breakdownParts,
  ].map(sanitizeForDocId)
  return parts.join('_')
}

// ── Source hash ───────────────────────────────────────────────────
// Hash covers the identity fields + raw numeric metrics.
// Does NOT include access token or URL.

export function createSourceHash(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

// ── Safe conversions ──────────────────────────────────────────────

function safeNum(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function safeStr(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

// ── Level-specific field extraction ──────────────────────────────

function extractLevelObjectInfo(
  level: CampaignMetaInsightLevel,
  row: Record<string, unknown>
): { metaObjectId: string; metaObjectName: string } {
  switch (level) {
    case 'campaign':
      return {
        metaObjectId: safeStr(row['campaign_id']),
        metaObjectName: safeStr(row['campaign_name']),
      }
    case 'adset':
      return {
        metaObjectId: safeStr(row['adset_id']),
        metaObjectName: safeStr(row['adset_name']),
      }
    case 'ad':
      return {
        metaObjectId: safeStr(row['ad_id']),
        metaObjectName: safeStr(row['ad_name']),
      }
  }
}

// ── Main normalizer ───────────────────────────────────────────────

export function normalizeMetaInsightRow(params: {
  campaignId: string
  mappingId?: string
  metaAccountId: string
  level: CampaignMetaInsightLevel
  breakdownType?: CampaignMetaInsightBreakdownType
  row: Record<string, unknown>
  fetchedAt: string
}): CampaignMetaInsightSnapshot {
  const {
    campaignId,
    mappingId,
    metaAccountId,
    level,
    row,
    fetchedAt,
    breakdownType = 'none',
  } = params
  const { metaObjectId, metaObjectName } = extractLevelObjectInfo(level, row)

  const dateStart = safeStr(row['date_start'])
  const dateStop = safeStr(row['date_stop'])

  const videoPlayActions = Array.isArray(row['video_play_actions'])
    ? (row['video_play_actions'] as { value?: unknown }[])
    : []
  const videoPlay = videoPlayActions.reduce((acc, a) => acc + safeNum(a?.value), 0)

  const thruPlayActions = Array.isArray(row['video_thruplay_watched_actions'])
    ? (row['video_thruplay_watched_actions'] as { value?: unknown }[])
    : []
  const thruPlay = thruPlayActions.reduce((acc, a) => acc + safeNum(a?.value), 0)

  let conversions = 0
  if (Array.isArray(row['actions'])) {
    const actions = row['actions'] as { action_type?: unknown; value?: unknown }[]
    conversions = actions
      .filter((a) => String(a?.action_type ?? '').startsWith('offsite_conversion'))
      .reduce((acc, a) => acc + safeNum(a?.value), 0)
  } else {
    conversions = safeNum(row['conversions'])
  }

  const spend = safeNum(row['spend'])
  const impressions = safeNum(row['impressions'])
  const reach = safeNum(row['reach'])
  const clicks = safeNum(row['clicks'])
  const ctr = safeNum(row['ctr'])
  const cpc = safeNum(row['cpc'])
  const cpm = safeNum(row['cpm'])
  const currency = safeStr(row['currency']) || undefined
  const hourRaw = safeStr(row['hourly_stats_aggregated_by_advertiser_time_zone'])
  const parsedHour = /^\d{2}/.test(hourRaw) ? Number(hourRaw.slice(0, 2)) : null

  const breakdownAge = breakdownType === 'age_gender' ? (safeStr(row['age']) || null) : null
  const breakdownGender = breakdownType === 'age_gender' ? (safeStr(row['gender']) || null) : null
  const breakdownPublisherPlatform =
    breakdownType === 'placement' ? (safeStr(row['publisher_platform']) || null) : null
  const breakdownPlatformPosition =
    breakdownType === 'placement' ? (safeStr(row['platform_position']) || null) : null
  const breakdownHour =
    breakdownType === 'hourly' && Number.isFinite(parsedHour) ? parsedHour : null

  const sourceHash = createSourceHash({
    campaignId,
    metaAccountId,
    level,
    breakdownType,
    breakdownAge,
    breakdownGender,
    breakdownPublisherPlatform,
    breakdownPlatformPosition,
    breakdownHour,
    metaObjectId,
    dateStart,
    dateStop,
    spend,
    impressions,
    reach,
    clicks,
    ctr,
    cpc,
    cpm,
    conversions,
    videoPlay,
    thruPlay,
  })

  const snapshot: CampaignMetaInsightSnapshot = {
    id: '',
    campaignId,
    mappingId,
    metaAccountId,
    level,
    breakdownType,
    breakdownAge,
    breakdownGender,
    breakdownPublisherPlatform,
    breakdownPlatformPosition,
    breakdownHour,
    metaObjectId,
    metaObjectName,
    dateStart,
    dateStop,
    spend,
    impressions,
    reach,
    clicks,
    ctr,
    cpc,
    cpm,
    conversions,
    videoPlay,
    thruPlay,
    currency,
    fetchedAt,
    sourceHash,
  }

  snapshot.id = createMetaInsightSnapshotId(snapshot)
  return snapshot
}

// ── Request validation ────────────────────────────────────────────

export function validateRefreshRequest(
  body: unknown
): { valid: true; data: CampaignMetaRefreshRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'body가 필요합니다.' }
  }
  const b = body as Record<string, unknown>

  if (typeof b['mappingId'] !== 'string' || !b['mappingId']) {
    return { valid: false, error: 'mappingId가 필요합니다.' }
  }
  if (typeof b['metaAccountId'] !== 'string' || !b['metaAccountId']) {
    return { valid: false, error: 'metaAccountId가 필요합니다.' }
  }
  if (!Array.isArray(b['levels']) || b['levels'].length === 0) {
    return { valid: false, error: 'levels가 필요합니다.' }
  }
  const validLevels: CampaignMetaInsightLevel[] = ['campaign', 'adset', 'ad']
  for (const lv of b['levels'] as unknown[]) {
    if (!validLevels.includes(lv as CampaignMetaInsightLevel)) {
      return { valid: false, error: `유효하지 않은 level: ${lv}` }
    }
  }
  if (typeof b['dateStart'] !== 'string' || !b['dateStart']) {
    return { valid: false, error: 'dateStart가 필요합니다.' }
  }
  if (typeof b['dateStop'] !== 'string' || !b['dateStop']) {
    return { valid: false, error: 'dateStop가 필요합니다.' }
  }

  const safeStringArray = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v)) return undefined
    const filtered = v.filter((x): x is string => typeof x === 'string' && x.length > 0)
    return filtered.length > 0 ? filtered : undefined
  }

  const validBreakdowns: CampaignMetaInsightBreakdownType[] = ['none', 'age_gender', 'placement', 'hourly']
  let breakdowns: CampaignMetaInsightBreakdownType[] | undefined
  if (b['breakdowns'] !== undefined) {
    if (!Array.isArray(b['breakdowns'])) {
      return { valid: false, error: 'breakdowns는 배열이어야 합니다.' }
    }
    for (const bd of b['breakdowns'] as unknown[]) {
      if (!validBreakdowns.includes(bd as CampaignMetaInsightBreakdownType)) {
        return { valid: false, error: `유효하지 않은 breakdown 값: ${bd}` }
      }
    }
    breakdowns = [...new Set(b['breakdowns'] as CampaignMetaInsightBreakdownType[])]
  }

  return {
    valid: true,
    data: {
      mappingId: b['mappingId'] as string,
      metaAccountId: b['metaAccountId'] as string,
      levels: b['levels'] as CampaignMetaInsightLevel[],
      dateStart: b['dateStart'] as string,
      dateStop: b['dateStop'] as string,
      metaCampaignIds: safeStringArray(b['metaCampaignIds']),
      metaAdsetIds: safeStringArray(b['metaAdsetIds']),
      metaAdIds: safeStringArray(b['metaAdIds']),
      breakdowns,
    },
  }
}
