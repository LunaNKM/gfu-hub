import type { CampaignSection } from './index'

export function isLegacyCampaignSection(section: CampaignSection): boolean {
  return section.type === 'data_table' || section.type === 'dashboard'
}

export function isDocumentCampaignSection(section: CampaignSection): boolean {
  return section.type === 'document'
}
