import {
  CampaignSectionType,
  CampaignDocumentContent,
  CampaignDataTableContent,
  CampaignDashboardContent,
  CampaignDataColumn,
  CampaignDataRow,
  CampaignDashboardAggregation,
} from '@/types'

export function createDefaultContent(
  type: CampaignSectionType
): CampaignDocumentContent | CampaignDataTableContent | CampaignDashboardContent {
  if (type === 'document') return { blocks: [] }
  if (type === 'data_table') return { columns: [], rows: [] }
  return { widgets: [] }
}

export function normalizeCellValue(
  value: unknown,
  columnType: string
): string | number | boolean | null {
  if (value === null || value === undefined || value === '') return null
  if (columnType === 'number' || columnType === 'currency' || columnType === 'percent') {
    const n = Number(String(value).replace(/[^0-9.\-]/g, ''))
    return isNaN(n) ? null : n
  }
  if (columnType === 'checkbox') {
    if (typeof value === 'boolean') return value
    const s = String(value).toLowerCase()
    return s === 'true' || s === '1' || s === 'yes'
  }
  return String(value)
}

export function aggregateRows(
  rows: CampaignDataRow[],
  dimensionColumnId: string,
  metricColumnId: string,
  aggregation: CampaignDashboardAggregation
): { dimension: string; value: number }[] {
  const groups: Record<string, number[]> = {}

  for (const row of rows) {
    const dim = String(row.cells[dimensionColumnId] ?? '알 수 없음')
    const raw = row.cells[metricColumnId]
    const val = typeof raw === 'number' ? raw : Number(raw)
    if (!groups[dim]) groups[dim] = []
    if (!isNaN(val)) groups[dim].push(val)
  }

  return Object.entries(groups).map(([dimension, vals]) => {
    let value = 0
    if (aggregation === 'sum') value = vals.reduce((a, b) => a + b, 0)
    else if (aggregation === 'avg') value = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    else if (aggregation === 'count') value = vals.length
    else if (aggregation === 'min') value = vals.length > 0 ? Math.min(...vals) : 0
    else if (aggregation === 'max') value = vals.length > 0 ? Math.max(...vals) : 0
    return { dimension, value }
  })
}

export function aggregateSingle(
  rows: CampaignDataRow[],
  metricColumnId: string,
  aggregation: CampaignDashboardAggregation
): number {
  const vals = rows
    .map((r) => r.cells[metricColumnId])
    .filter((v) => v !== null && v !== undefined)
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .filter((v) => !isNaN(v))

  if (vals.length === 0) return 0
  if (aggregation === 'sum') return vals.reduce((a, b) => a + b, 0)
  if (aggregation === 'avg') return vals.reduce((a, b) => a + b, 0) / vals.length
  if (aggregation === 'count') return vals.length
  if (aggregation === 'min') return Math.min(...vals)
  if (aggregation === 'max') return Math.max(...vals)
  return 0
}

export function buildChartData(
  rows: CampaignDataRow[],
  columns: CampaignDataColumn[],
  dimensionColumnId: string | undefined,
  metricColumnId: string | undefined,
  aggregation: CampaignDashboardAggregation
): { name: string; value: number }[] {
  if (!dimensionColumnId || !metricColumnId) return []
  const dimCol = columns.find((c) => c.id === dimensionColumnId)
  const metCol = columns.find((c) => c.id === metricColumnId)
  if (!dimCol || !metCol) return []

  const agg = aggregateRows(rows, dimensionColumnId, metricColumnId, aggregation)
  return agg.map((a) => ({ name: a.dimension, value: a.value }))
}

export function formatNumber(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toFixed(2)
}
