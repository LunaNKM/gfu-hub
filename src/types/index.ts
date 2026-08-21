// Firebase 관련 타입들
export interface User {
  uid: string
  email: string
  displayName: string
  photoURL: string
  createdAt: Date
  lastLoginAt: Date
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


// ===== 광고 캘린더 =====
// 브랜드 목록은 브랜드 관리 탭의 `brands` 와 분리된 전용 컬렉션이다.
// 자세한 배경은 docs/ad-calendar.md 참고.

export interface AdCalendarBrand {
  id: string
  name: string
  /** 달력 바에 붙는 약칭 (WISH, RJR ...) */
  short: string
  /** #rrggbb */
  color: string
  /** 집행 시장. 현재는 JP 만 쓴다. */
  market: string
  /** 표시용. 일예산 계산에는 쓰지 않는다(넷 기준). */
  markupRate: number
  order: number
  archived: boolean
  /** 브랜드 관리 탭 brands 문서와의 느슨한 연결 (선택) */
  linkedBrandId?: string
  createdAt: Date
  updatedAt: Date
  createdBy: string
  updatedBy: string
}

export interface AdCampaignLine {
  /** 's-meta' | 'meta' | 'X' | 'TikTok' 등. 자유 입력이다. */
  media: string
  objective: string
  target: string
  /** 마크업 제외(넷) JP 매체비 */
  budgetJpNet: number
  /** 마크업 제외(넷) KR 매체비 */
  budgetKrNet: number
  /** 믹스안이 일예산을 나눈 일수. 캠페인 기간과 다를 수 있다. */
  days: number
  /** 라인 기간이 캠페인과 다를 때만 채운다. */
  startDate?: string
  endDate?: string
}

export interface AdCampaignSource {
  fileName: string
  sheetName: string
  importedAt: Date
}

export interface AdCampaign {
  id: string
  brandId: string
  name: string
  /** 'Qoo10' | '자사몰' 등 주요 채널 */
  channel: string
  /** YYYY-MM-DD */
  startDate: string
  endDate: string
  /** 걸치는 달 목록. Firestore 월별 조회용 (['2026-08','2026-09']) */
  months: string[]
  color: string
  targetRoas?: number
  memo?: string
  source?: AdCampaignSource
  lines: AdCampaignLine[]
  createdAt: Date
  updatedAt: Date
  createdBy: string
  updatedBy: string
}
