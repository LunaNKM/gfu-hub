export interface CampaignShareReport {
  id: string
  campaignId: string
  tokenHash?: string
  shareTokenId?: string
  title: string
  enabled: boolean
  editable: boolean
  sectionIds: string[]
  databaseIds: string[]
  blockIds?: string[]
  expiresAt?: Date | string
  createdAt: Date | string
  updatedAt: Date | string
}

export interface CampaignSharePermission {
  canView: boolean
  canEdit: boolean
  editableSectionIds: string[]
  editableDatabaseIds: string[]
}
