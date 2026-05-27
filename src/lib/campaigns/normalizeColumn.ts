import type { CampaignDataColumn, CampaignColumnType, CampaignSelectOption } from '@/types'
import { autoColor } from '@/lib/palette'

const VALID_TYPES = new Set<CampaignColumnType>([
  'text', 'long_text', 'number', 'currency', 'percent',
  'date', 'select', 'multi_select', 'checkbox', 'url', 'rating',
])

export function normalizeSelectOptions(
  options: unknown
): CampaignSelectOption[] | undefined {
  if (!options || !Array.isArray(options) || options.length === 0) return undefined

  return options
    .map((opt) => {
      if (typeof opt === 'string') {
        return { value: opt, color: autoColor(opt) }
      }
      if (opt && typeof opt === 'object' && 'value' in opt) {
        const raw = opt as Record<string, unknown>
        const value = String(raw.value ?? '')
        const color = typeof raw.color === 'string' ? raw.color : autoColor(value)
        return { value, color }
      }
      return { value: String(opt), color: autoColor(String(opt)) }
    })
    .filter((o) => o.value.length > 0)
}

export function normalizeColumn(col: unknown): CampaignDataColumn {
  if (!col || typeof col !== 'object') {
    return { id: `col_${Date.now()}`, name: '컬럼', type: 'text' }
  }

  const raw = col as Record<string, unknown>
  const type: CampaignColumnType = VALID_TYPES.has(raw.type as CampaignColumnType)
    ? (raw.type as CampaignColumnType)
    : 'text'

  const normalized: CampaignDataColumn = {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    type,
  }

  if (raw.role) normalized.role = raw.role as CampaignDataColumn['role']
  if (raw.config && typeof raw.config === 'object') {
    normalized.config = raw.config as CampaignDataColumn['config']
  }

  const options = normalizeSelectOptions(raw.options)
  if (options) normalized.options = options

  return normalized
}
