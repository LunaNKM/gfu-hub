export type CampaignMetaInsightLevel = 'campaign' | 'adset' | 'ad'

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
