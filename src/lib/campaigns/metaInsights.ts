import type {
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
    'campaignId' | 'metaAccountId' | 'level' | 'metaObjectId' | 'dateStart' | 'dateStop'
  >
): string {
  const parts = [
    'metaInsight',
    snapshot.campaignId,
    snapshot.metaAccountId,
    snapshot.level,
    snapshot.metaObjectId,
    snapshot.dateStart,
    snapshot.dateStop,
  ].map(sanitizeForDocId)
  return parts.join('_')
}

// ── Safe number conversion ────────────────────────────────────────

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
  row: Record<string, unknown>
  fetchedAt: string
}): CampaignMetaInsightSnapshot {
  const { campaignId, mappingId, metaAccountId, level, row, fetchedAt } = params
  const { metaObjectId, metaObjectName } = extractLevelObjectInfo(level, row)

  const dateStart = safeStr(row['date_start'])
  const dateStop = safeStr(row['date_stop'])

  // video_play_actions is an array of action objects: [{ action_type, value }]
  const videoPlayActions = Array.isArray(row['video_play_actions'])
    ? (row['video_play_actions'] as { value?: unknown }[])
    : []
  const videoPlay = videoPlayActions.reduce((acc, a) => acc + safeNum(a?.value), 0)

  const thruPlayActions = Array.isArray(row['video_thruplay_watched_actions'])
    ? (row['video_thruplay_watched_actions'] as { value?: unknown }[])
    : []
  const thruPlay = thruPlayActions.reduce((acc, a) => acc + safeNum(a?.value), 0)

  // conversions from actions array if present, else direct field
  let conversions = 0
  if (Array.isArray(row['actions'])) {
    const actions = row['actions'] as { action_type?: unknown; value?: unknown }[]
    conversions = actions
      .filter((a) => String(a?.action_type ?? '').startsWith('offsite_conversion'))
      .reduce((acc, a) => acc + safeNum(a?.value), 0)
  } else {
    conversions = safeNum(row['conversions'])
  }

  const snapshot: CampaignMetaInsightSnapshot = {
    id: '',
    campaignId,
    mappingId,
    metaAccountId,
    level,
    metaObjectId,
    metaObjectName,
    dateStart,
    dateStop,
    spend: safeNum(row['spend']),
    impressions: safeNum(row['impressions']),
    reach: safeNum(row['reach']),
    clicks: safeNum(row['clicks']),
    ctr: safeNum(row['ctr']),
    cpc: safeNum(row['cpc']),
    cpm: safeNum(row['cpm']),
    conversions,
    videoPlay,
    thruPlay,
    currency: safeStr(row['currency']) || undefined,
    fetchedAt,
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

  return {
    valid: true,
    data: {
      metaAccountId: b['metaAccountId'] as string,
      mappingId: typeof b['mappingId'] === 'string' ? b['mappingId'] : undefined,
      levels: b['levels'] as CampaignMetaInsightLevel[],
      dateStart: b['dateStart'] as string,
      dateStop: b['dateStop'] as string,
      metaCampaignIds: Array.isArray(b['metaCampaignIds'])
        ? (b['metaCampaignIds'] as string[])
        : undefined,
      metaAdsetIds: Array.isArray(b['metaAdsetIds'])
        ? (b['metaAdsetIds'] as string[])
        : undefined,
      metaAdIds: Array.isArray(b['metaAdIds']) ? (b['metaAdIds'] as string[]) : undefined,
    },
  }
}
