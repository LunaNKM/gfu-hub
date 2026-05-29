export type ProgressColor = 'blue' | 'green' | 'orange' | 'gray'

export interface CampaignStatusProgress {
  name: string
  count: number
  pct: number
  color: ProgressColor
}

export interface CampaignRosterProgressSummary {
  statuses: CampaignStatusProgress[]
  platforms: CampaignStatusProgress[]
  totalConfirmed: number
}

export interface CampaignContentPerformanceSummary {
  totalViews: number
  uploadCount: number
  avgViews: number
  avgEr: number
  collectionRate: number
  top5ByViews: { name: string; views: number }[]
  top5ByEr: { name: string; er: number }[]
  byPlatform: CampaignStatusProgress[]
  byFormat: CampaignStatusProgress[]
  barData: { label: string; pct: number }[]
  barMode: 'date' | 'influencer' | 'empty'
}

export interface CampaignAdPerformanceSummary {
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
  byLevel: CampaignStatusProgress[]
  top5BySpend: { name: string; spend: number }[]
  top5ByCtr: { name: string; ctr: number }[]
}

export interface CampaignBudgetSummary {
  plannedBudget: number
  actualSpend: number
  remainingBudget: number
  burnRate: number
}

export interface CampaignDataQualitySummary {
  confirmedCount: number
  performanceRowCount: number
  performanceCollectionRate: number
  confirmedWithoutPerformanceCount: number
  warnings: string[]
}

export interface CampaignDashboardSummary {
  confirmedCount: number
  uploadedCount: number
  uploadRate: number
  performanceCollectionRate: number
  avgViews: number
  avgEr: number
  metaSpend: number
  metaCtr: number
  metaCpc: number
  metaCpm: number
  totalAdBudget: number
  totalViews: number
  adClicks: number
}

// ── 상세 분석 뷰 행 타입 ──────────────────────────────────────────

export interface CampaignContentPerformanceRow {
  name: string
  platform: string
  format: string
  category: string
  followers: number | null
  views: number | null
  likes: number | null
  saves: number | null
  comments: number | null
  shares: number | null
  er: number | null
}

export interface CampaignAdPerformanceRow {
  level: string
  name: string
  spend: number | null
  impressions: number | null
  reach: number | null
  clicks: number | null
  ctr: number | null
  cpc: number | null
  cpm: number | null
  thruPlay: number | null

  // Meta API snapshot 확장 필드 (향후 CampaignMetaInsightSnapshot 기반 전환 대비)
  metaObjectId?: string
  metaAccountId?: string
  dateStart?: string
  dateStop?: string
  currency?: string
  fetchedAt?: string
  sourceHash?: string
}

export interface CampaignMetaAudienceRow {
  age: string
  gender: string
  impressions: number
  clicks: number
  spend: number
  ctr: number
  cpc: number
}

export interface CampaignMetaPlacementRow {
  publisherPlatform: string
  platformPosition: string
  impressions: number
  clicks: number
  spend: number
  ctr: number
  cpc: number
  cpm: number
}

export interface CampaignMetaHourlyRow {
  hour: number
  impressions: number
  clicks: number
  spend: number
  ctr: number
}

export interface CampaignRosterDetailRow {
  name: string
  platform: string
  category: string
  followers: number | null
  status: string
  note: string
  url: string
}

export interface CampaignCandidateDetailRow {
  name: string
  platform: string
  category: string
  followers: number | null
  confirmed: string
  note: string
  url: string
}

export interface CampaignBudgetDetailRow {
  item: string
  channel: string
  purpose: string
  budget: number | null
  estCpm: number | null
  estCpc: number | null
  estImpr: number | null
  estClick: number | null
  note: string
}

export interface CampaignDetailTabSummary {
  label: string
  pct: number
  value: string
  color: ProgressColor
}

export interface CampaignDetailTables {
  post: CampaignContentPerformanceRow[]
  ad: CampaignAdPerformanceRow[]
  confirmed: CampaignRosterDetailRow[]
  candidates: CampaignCandidateDetailRow[]
  budget: CampaignBudgetDetailRow[]
  postSummary: CampaignDetailTabSummary[]
  adSummary: CampaignDetailTabSummary[]
  confirmedSummary: CampaignDetailTabSummary[]
  candidatesSummary: CampaignDetailTabSummary[]
  budgetSummary: CampaignDetailTabSummary[]
  postNote: string
  adNote: string
  confirmedNote: string
  candidatesNote: string
  budgetNote: string
  metaSpendSpark: number[]
  metaAudienceRows?: CampaignMetaAudienceRow[]
  metaPlacementRows?: CampaignMetaPlacementRow[]
  metaHourlyRows?: CampaignMetaHourlyRow[]
}
