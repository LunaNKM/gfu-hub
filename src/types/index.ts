// Firebase 관련 타입들
export interface User {
  uid: string
  email: string
  displayName: string
  photoURL: string
  createdAt: Date
  lastLoginAt: Date
}

export interface App {
  id: string
  name: string
  url: string
  icon: string
  category: string
  createdAt: Date
  updatedAt: Date
  createdBy: string
  updatedBy: string
}

export interface Doc {
  id: string
  title: string
  content: string
  category: string
  tags: string[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  createdBy: string
  updatedBy: string
  source?: 'manual' | 'drive'
  driveFileId?: string
  driveModifiedTime?: string
}

export interface DocChunk {
  id: string
  docId: string
  title: string
  chunkIndex: number
  content: string
  embedding?: number[]
  category: string
  tags: string[]
  updatedAt: Date
}

export interface Conversation {
  id: string
  userId: string
  title: string
  createdAt: Date
  updatedAt: Date
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments?: Attachment[]
  createdAt: Date
  tokenUsage?: TokenUsage
}

export interface Attachment {
  fileName: string
  fileType: string
  size: number
  storagePath: string
  downloadURL: string
  extractedText?: string
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface AiUsageLog {
  id: string
  userId: string
  userEmail?: string
  conversationId?: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedTokens?: number
  costUsd: number
  createdAt: Date
  feature: 'chat' | 'prompt_optimizer' | 'rag' | 'embedding' | 'memory'
  success: boolean
  errorMessage?: string
}

export interface UserSettings {
  userId: string
  metaInsightsEnabled: boolean
  selectedAdAccounts: string[]
  selectedCampaigns: string[]
  updatedAt: Date
}

export interface FileRecord {
  id: string
  userId: string
  fileName: string
  fileType: string
  size: number
  storagePath: string
  downloadURL: string
  extractedText?: string
  createdAt: Date
}

// ── 일본 시장 인텔리전스 ────────────────────────────────────────
export interface MarketBriefTopic {
  title: string
  description: string
  source?: string
}

export interface MarketBrief {
  id: string
  date: string        // YYYY-MM-DD (생성 날짜 = 오늘)
  searchDate: string  // YYYY-MM-DD (검색 기준 날짜 = 어제)
  summary: string
  topics: MarketBriefTopic[]
  sources: { title: string; url: string }[]
  createdAt: Date
  expiresAt: Date
}

// ── 장기 기억 ────────────────────────────────────────────────
export interface Memory {
  id: string
  userId: string
  content: string
  embedding?: number[]
  importance?: number   // 1~5 (TASK 5: 중요도 축)
  conversationId?: string
  createdAt: Date
}

export interface TrendSignal {
  id: string
  title: string
  summary: string
  market: 'JP'
  category: 'beauty' | 'fashion' | 'food' | 'travel' | 'platform' | 'consumer' | 'other'
  platforms: string[]
  relatedBrands: string[]
  relatedCompetitors: string[]
  impactScore: number
  confidenceScore: number
  sourceUrls: string[]
  observedAt: string
  savedBy?: string
  createdAt: Date
  updatedAt: Date
}

export interface BrandImpact {
  id: string
  trendSignalId: string
  brandName: string
  relevanceScore: number
  opportunity: string
  risk: string
  suggestedAction: string
  createdAt: Date
}

export interface CompetitorWatch {
  id: string
  brandName: string
  competitorName: string
  keywords: string[]
  platforms: string[]
  active: boolean
  lastCheckedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface WeeklyMarketReport {
  id: string
  weekStart: string
  weekEnd: string
  summary: string
  keyTrends: string[]
  brandImpacts: BrandImpact[]
  competitorMoves: string[]
  recommendedActions: string[]
  createdAt: Date
}

