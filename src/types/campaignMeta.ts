export type CampaignMetaInsightLevel = 'campaign' | 'adset' | 'ad'
export type CampaignMetaInsightBreakdownType =
  | 'none'
  | 'age_gender'
  | 'placement'
  | 'hourly'

export interface CampaignMetaMapping {
  id: string
  campaignId: string
  metaAccountId: string
  selectedLevels: CampaignMetaInsightLevel[]
  metaCampaignIds: string[]
  metaAdsetIds: string[]
  metaAdIds: string[]
  enabled: boolean
  createdAt: Date | string
  updatedAt: Date | string
}

export interface CampaignMetaInsightSnapshot {
  id: string
  campaignId: string
  mappingId?: string
  metaAccountId: string
  level: CampaignMetaInsightLevel
  breakdownType?: CampaignMetaInsightBreakdownType
  breakdownAge?: string | null
  breakdownGender?: string | null
  breakdownPublisherPlatform?: string | null
  breakdownPlatformPosition?: string | null
  breakdownHour?: number | null
  metaObjectId: string
  metaObjectName: string
  dateStart: string
  dateStop: string
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number
  cpc: number
  cpm: number
  conversions: number
  videoPlay: number
  thruPlay: number
  currency?: string
  fetchedAt: Date | string
  sourceHash?: string
}

export interface CampaignMetaRefreshRequest {
  metaAccountId: string
  mappingId: string
  levels: CampaignMetaInsightLevel[]
  dateStart: string
  dateStop: string
  metaCampaignIds?: string[]
  metaAdsetIds?: string[]
  metaAdIds?: string[]
}

export interface CampaignMetaRefreshResult {
  campaignId: string
  metaAccountId: string
  rawFetchedCount: number
  fetchedCount: number
  upsertedCount: number
  skippedCount: number
  levels: CampaignMetaInsightLevel[]
  dateStart: string
  dateStop: string
  fetchedAt: string
}

// ── Meta Object 조회 타입 (선택 UI용, mapping에는 ID만 저장) ──────────

export interface MetaCampaignObject {
  id: string
  name: string
  status?: string
  effectiveStatus?: string
  objective?: string
  createdTime?: string
  updatedTime?: string
}

export interface MetaAdsetObject {
  id: string
  name: string
  campaignId: string
  status?: string
  effectiveStatus?: string
  createdTime?: string
  updatedTime?: string
}

export interface MetaAdObject {
  id: string
  name: string
  campaignId?: string
  adsetId: string
  status?: string
  effectiveStatus?: string
  createdTime?: string
  updatedTime?: string
}

export interface MetaObjectsResponse {
  campaigns: MetaCampaignObject[]
  adsets: MetaAdsetObject[]
  ads: MetaAdObject[]
  fetchedAt: string
}

export interface CampaignInsightAsset {
  id: string
  campaignId: string
  sourceType:
    | 'meta_analytics'
    | 'influencer_performance'
    | 'budget'
    | 'dashboard'
    | 'manual'
  sourceIds: string[]
  periodStart?: string
  periodEnd?: string
  title: string
  summary: string
  metrics: Record<string, string | number | boolean | null>
  highlights: string[]
  risks: string[]
  recommendations: string[]
  embeddingText: string
  createdAt: Date | string
  updatedAt?: Date | string
}
