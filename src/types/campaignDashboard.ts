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
  top5ByViews: { name: string; views: number }[]
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
