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

export type CampaignStatus = 'proposal' | 'active' | 'completed'

// 탭 유형 — 탭 이름 키워드로 자동 분류
export type SheetTabType =
  | 'timeline'    // 타임라인, 확정 IF, 기자단, 체험단
  | 'engagement'  // 인게이지먼트
  | 'candidates'  // 후보 리스트, 추천, 시딩
  | 'content'     // 콘텐츠 검토
  | 'schedule'    // 방문 일정, IF 예약
  | 'shipping'    // 배송
  | 'other'

// 시트 한 행 (컬럼 구조가 탭마다 다름 → 유연한 Record)
export interface SheetRow {
  _section?: string   // 지점 등 섹션 구분 (자동 감지)
  _platform?: string  // URL에서 자동 판별
  [key: string]: string | number | boolean | null | undefined
}

// 파싱된 탭 1개
export interface ParsedSheet {
  name: string          // 원본 탭 이름
  displayName: string   // 앞의 "1. ", "Q2 " 등 제거한 이름
  type: SheetTabType
  rawHeaders: string[]  // 원본 헤더
  rows: SheetRow[]
  rowCount: number
}

// 캠페인 도큐먼트 내 시트 인덱스 (목록용 경량 정보)
export interface SheetIndexItem {
  key: string           // Record 키 (slugified tab name)
  name: string
  displayName: string
  type: SheetTabType
  rowCount: number
}

// ── 인플루언서 CRM ────────────────────────────────────────────
export interface InfluencerAppearance {
  campaignId: string
  campaignName: string
  clientName: string
  tabType: string   // 'timeline' | 'candidates' | 'engagement' | ...
  syncedAt: string  // ISO date string
  imp?: number      // 조회수 (있는 경우)
  engSum?: number   // 총 ENG (좋아요+댓글+저장+공유+리포스트)
  er?: number       // ER % (소수점 2자리)
}

export interface Influencer {
  id: string          // Firestore doc ID = "{platform}_{handle}" normalized
  handle: string
  platform: string    // 'Instagram' | 'TikTok' | 'YouTube' | 'X' | ''
  profileUrl: string
  followers: number
  appearances: InfluencerAppearance[]
  firstSeenAt: Date
  lastSeenAt: Date
  updatedAt: Date
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
  conversationId?: string
  createdAt: Date
}

export interface Campaign {
  id: string
  clientName: string
  campaignName: string
  status: CampaignStatus
  startDate: string        // YYYY-MM-DD
  endDate: string          // YYYY-MM-DD
  budget: number           // 원
  sheetsUrl?: string
  sheetsIndex?: SheetIndexItem[]
  sheets?: Record<string, ParsedSheet>
  sheetsLastSyncAt?: Date
  memo?: string
  createdAt: Date
  updatedAt: Date
  createdBy: string
}
