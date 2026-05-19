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
  conversationId?: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  createdAt: Date
  feature: 'chat' | 'prompt_optimizer' | 'rag' | 'embedding'
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
