export {
  createDefaultTableContent,
  createEmptyDbRow as createEmptyRow,
} from '@/lib/campaigns/databaseTemplates'

import type { CampaignDataColumn, CampaignDataRow } from '@/types'

export function createSampleRows(columns: CampaignDataColumn[]): CampaignDataRow[] {
  const today = new Date().toISOString().split('T')[0]
  const cells: CampaignDataRow['cells'] = {}

  for (const column of columns) {
    if (column.type === 'text') cells[column.id] = column.role === 'dimension' ? '예시 항목' : ''
    else if (column.type === 'number') cells[column.id] = column.role === 'performance' ? 10000 : 1000
    else if (column.type === 'currency') cells[column.id] = 500000
    else if (column.type === 'percent') cells[column.id] = 3.5
    else if (column.type === 'date') cells[column.id] = today
    else if (column.type === 'checkbox') cells[column.id] = false
    else if (column.type === 'url') cells[column.id] = ''
    else if (column.type === 'select') cells[column.id] = column.options?.[0]?.value ?? ''
    else if (column.type === 'multi_select') cells[column.id] = column.options?.[0] ? [column.options[0].value] : []
    else if (column.type === 'rating') cells[column.id] = 3
    else if (column.type === 'long_text') cells[column.id] = ''
    else cells[column.id] = null
  }

  return [{ id: `row_sample_${Date.now()}`, cells }]
}
