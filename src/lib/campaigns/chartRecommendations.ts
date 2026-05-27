import type {
  CampaignDataColumn,
  CampaignDataRow,
  CampaignDatabase,
  CampaignOverview,
  CampaignOverviewChart,
  CampaignOverviewMetric,
} from '@/types'
import { computeInfluencerEr } from './databaseTemplates'

export function numericValue(row: CampaignDataRow, colId: string): number | null {
  const value = row.cells[colId]
  if (value === null || value === undefined) return null
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

export function findColumn(
  columns: CampaignDataColumn[],
  names: string[],
  role?: CampaignDataColumn['role']
): CampaignDataColumn | undefined {
  return (
    columns.find((column) => role && column.role === role) ??
    columns.find((column) => names.includes(column.id) || names.includes(column.name))
  )
}

export function groupRowsByColumn(
  rows: CampaignDataRow[],
  column: CampaignDataColumn
): { name: string; value: number }[] {
  const groups: Record<string, number> = {}
  for (const row of rows) {
    const name = String(row.cells[column.id] ?? '미입력')
    groups[name] = (groups[name] ?? 0) + 1
  }
  return Object.entries(groups)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

export function rankRowsByMetric(
  rows: CampaignDataRow[],
  nameColumn: CampaignDataColumn,
  metricColumn: CampaignDataColumn
): { name: string; value: number }[] {
  return [...rows]
    .map((row) => ({
      name: String(row.cells[nameColumn.id] ?? '미입력'),
      value: numericValue(row, metricColumn.id) ?? 0,
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function buildDatabaseChartRecommendations(
  database: CampaignDatabase
): CampaignOverviewChart[] {
  const { columns, rows, businessType } = database
  if (!rows || rows.length === 0) return []

  const options: CampaignOverviewChart[] = []
  const platform = findColumn(columns, ['플랫폼', 'platform'], 'platform')
  const category = findColumn(columns, ['카테고리', 'category'], 'dimension')
  const status = findColumn(columns, ['현재 상태', '상태', 'status'], 'status')
  const name = findColumn(columns, ['계정명', '인플루언서', 'name'], 'dimension')
  const views = findColumn(columns, ['조회수', 'views'], 'performance')
  const er = findColumn(columns, ['ER', 'er'], 'metric')
  const spend = findColumn(columns, ['Spend', 'spend'], 'cost')
  const ctr = findColumn(columns, ['CTR', 'ctr'], 'metric')

  if (status) {
    options.push({
      id: `${database.id}:status`,
      title: '상태별 진행 현황',
      type: 'bar',
      data: groupRowsByColumn(rows, status),
    })
  }
  if (platform) {
    options.push({
      id: `${database.id}:platform`,
      title: businessType === 'confirmed_influencers' ? '플랫폼별 확정 인원 수' : '플랫폼 비율',
      type: 'pie',
      data: groupRowsByColumn(rows, platform),
    })
  }
  if (category) {
    options.push({
      id: `${database.id}:category`,
      title: '카테고리 비율',
      type: 'pie',
      data: groupRowsByColumn(rows, category),
    })
  }
  if (name && views) {
    options.push({
      id: `${database.id}:top_views`,
      title: '조회수 상위 인플루언서',
      type: 'ranking',
      data: rankRowsByMetric(rows, name, views),
    })
  }
  if (name && er) {
    options.push({
      id: `${database.id}:top_er`,
      title: 'ER 상위 인플루언서',
      type: 'ranking',
      data: rankRowsByMetric(rows, name, er),
    })
  }
  if (spend) {
    options.push({
      id: `${database.id}:meta_spend`,
      title: 'Meta 광고비',
      type: 'bar',
      data: rankRowsByMetric(rows, name ?? columns[0], spend),
    })
  }
  if (ctr) {
    options.push({
      id: `${database.id}:meta_ctr`,
      title: 'Meta CTR',
      type: 'ranking',
      data: rankRowsByMetric(rows, name ?? columns[0], ctr),
    })
  }

  return options.filter((option) => option.data.length > 0)
}

export function buildCampaignOverviewFromDatabases(databases: CampaignDatabase[]): CampaignOverview {
  const confirmed = databases.find((database) => database.businessType === 'confirmed_influencers')
  const performance = databases.find((database) => database.businessType === 'influencer_performance')
  const candidates = databases.find((database) => database.businessType === 'influencer_candidates')
  const adBudget = databases.find((database) => database.businessType === 'ad_budget')
  const meta = databases.find((database) => database.businessType === 'meta_analytics')

  const confirmedRows = confirmed?.rows ?? []
  const performanceRows = performance?.rows ?? []
  const candidateRows = candidates?.rows ?? []

  const statusCol = confirmed ? findColumn(confirmed.columns, ['현재 상태', 'status'], 'status') : undefined
  const uploadedCount = statusCol
    ? confirmedRows.filter((row) => row.cells[statusCol.id] === '업로드완료').length
    : 0
  const uploadRate = confirmedRows.length > 0 ? Math.round((uploadedCount / confirmedRows.length) * 100) : 0

  const viewsCol = performance
    ? findColumn(performance.columns, ['조회수', 'views'], 'performance')
    : undefined
  const viewValues = viewsCol
    ? performanceRows.map((row) => numericValue(row, viewsCol.id)).filter((value): value is number => value !== null)
    : []
  const avgViews = Math.round(average(viewValues))

  const erCol = performance ? findColumn(performance.columns, ['ER', 'er'], 'metric') : undefined
  const erValues = performanceRows
    .map((row) => {
      if (erCol) return numericValue(row, erCol.id)
      return computeInfluencerEr(row)
    })
    .filter((value): value is number => value !== null)
  const avgEr = erValues.length > 0 ? Math.round(average(erValues) * 100) / 100 : 0

  const budgetCol = adBudget ? findColumn(adBudget.columns, ['예산', 'budget'], 'cost') : undefined
  const totalBudget = budgetCol
    ? (adBudget?.rows ?? [])
        .map((row) => numericValue(row, budgetCol.id))
        .filter((value): value is number => value !== null)
        .reduce((sum, value) => sum + value, 0)
    : 0

  const metaSpendCol = meta ? findColumn(meta.columns, ['Spend', 'spend'], 'cost') : undefined
  const metaSpend = meta && metaSpendCol
    ? meta.rows
        .map((row) => numericValue(row, metaSpendCol.id))
        .filter((value): value is number => value !== null)
        .reduce((sum, value) => sum + value, 0)
    : 0

  const metrics: CampaignOverviewMetric[] = [
    { id: 'confirmed_count', label: '확정 인원 수', value: confirmedRows.length, unit: '명' },
    {
      id: 'upload_rate',
      label: '콘텐츠 업로드 진행률',
      value: confirmedRows.length > 0 ? `${uploadRate}%` : '-',
    },
    {
      id: 'avg_views',
      label: '평균 조회수',
      value: viewValues.length > 0 ? avgViews.toLocaleString() : '-',
    },
    {
      id: 'avg_er',
      label: '평균 ER',
      value: erValues.length > 0 ? `${avgEr}%` : '-',
    },
    {
      id: 'meta_spend',
      label: 'Meta 광고비',
      value: metaSpend > 0 ? metaSpend.toLocaleString() : '-',
    },
    { id: 'meta_ctr', label: 'Meta CTR', value: '-' },
    { id: 'meta_cpc', label: 'Meta CPC', value: '-' },
    { id: 'meta_cpm', label: 'Meta CPM', value: '-' },
  ]

  if (totalBudget > 0) {
    metrics.push({
      id: 'total_ad_budget',
      label: '광고 예산 합계',
      value: totalBudget.toLocaleString(),
    })
  }

  const charts = [
    ...(confirmed ? buildDatabaseChartRecommendations(confirmed) : []),
    ...(performance ? buildDatabaseChartRecommendations(performance) : []),
    ...(candidates ? buildDatabaseChartRecommendations(candidates) : []),
    ...(meta ? buildDatabaseChartRecommendations(meta) : []),
  ]

  if (candidateRows.length > 0) {
    const confirmedCheckCol = candidates
      ? findColumn(candidates.columns, ['확정 여부', 'confirmed'], 'status')
      : undefined
    if (confirmedCheckCol) {
      const confirmedCount = candidateRows.filter((row) => row.cells[confirmedCheckCol.id] === true).length
      charts.push({
        id: 'candidate_confirmation_rate',
        title: '후보자 확정 현황',
        type: 'pie',
        data: [
          { name: '확정', value: confirmedCount },
          { name: '미확정', value: candidateRows.length - confirmedCount },
        ].filter((item) => item.value > 0),
      })
    }
  }

  return { metrics, charts }
}
