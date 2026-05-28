import type {
  CampaignDataColumn,
  CampaignDataRow,
  CampaignDatabase,
  CampaignOverview,
  CampaignOverviewChart,
  CampaignOverviewMetric,
  CampaignDashboardSummary,
  CampaignRosterProgressSummary,
  CampaignContentPerformanceSummary,
  CampaignAdPerformanceSummary,
  CampaignBudgetSummary,
  CampaignDataQualitySummary,
  CampaignStatusProgress,
} from '@/types'
import { computeInfluencerEr } from './databaseTemplates'

// ── Helpers ───────────────────────────────────────────────────────

export function numericValue(row: CampaignDataRow, colId: string): number | null {
  const value = row.cells[colId]
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function findColumn(
  columns: CampaignDataColumn[],
  names: string[],
  role?: CampaignDataColumn['role']
): CampaignDataColumn | undefined {
  const byName = columns.find((c) => names.includes(c.id) || names.includes(c.name))
  if (byName) return byName
  if (role) return columns.find((c) => c.role === role)
  return undefined
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
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function colSum(rows: CampaignDataRow[], col: CampaignDataColumn | undefined): number {
  if (!col) return 0
  return rows.reduce((acc, row) => acc + (numericValue(row, col.id) ?? 0), 0)
}

function toProgressList(
  groups: { name: string; value: number }[],
  total: number,
  colorMap: Record<string, CampaignStatusProgress['color']>
): CampaignStatusProgress[] {
  return groups.map(({ name, value }) => ({
    name,
    count: value,
    pct: total > 0 ? Math.round((value / total) * 100) : 0,
    color: colorMap[name] ?? 'gray',
  }))
}

// ── Per-database chart recommendations ───────────────────────────

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

// ── Sub-summary builders ──────────────────────────────────────────

function buildRosterProgress(confirmed: CampaignDatabase | undefined): CampaignRosterProgressSummary {
  const rows = confirmed?.rows ?? []
  const columns = confirmed?.columns ?? []
  const total = rows.length

  const statusCol = findColumn(columns, ['현재 상태', 'status'], 'status')
  const platformCol = findColumn(columns, ['플랫폼', 'platform'], 'platform')

  const STATUS_COLORS: Record<string, CampaignStatusProgress['color']> = {
    '업로드완료': 'green',
    '검수중': 'blue',
    '초안대기': 'orange',
    '계약완료': 'blue',
    '계약전': 'gray',
  }

  const statusGroups = statusCol ? groupRowsByColumn(rows, statusCol) : []
  const statuses = toProgressList(statusGroups, total, STATUS_COLORS)

  const PLATFORM_COLORS: Record<string, CampaignStatusProgress['color']> = {
    Instagram: 'blue',
    TikTok: 'green',
    YouTube: 'orange',
    X: 'gray',
  }

  const platformGroups = platformCol ? groupRowsByColumn(rows, platformCol) : []
  const platforms = toProgressList(platformGroups, total, PLATFORM_COLORS)

  return { statuses, platforms, totalConfirmed: total }
}

function buildBarData(
  performance: CampaignDatabase | undefined
): { data: { label: string; pct: number }[]; hasDate: boolean } {
  const rows = performance?.rows ?? []
  const columns = performance?.columns ?? []
  if (rows.length === 0) return { data: [], hasDate: false }

  const publishedAtCol = columns.find((c) => c.id === 'published_at' || c.name === '게시일')
  const viewsCol = findColumn(columns, ['조회수', 'views'], 'performance')
  const nameCol = findColumn(columns, ['계정명', 'name'], 'dimension')

  if (publishedAtCol && viewsCol) {
    const groups: Record<string, number> = {}
    for (const row of rows) {
      const date = String(row.cells[publishedAtCol.id] ?? '')
      if (!date) continue
      const v = numericValue(row, viewsCol.id) ?? 0
      groups[date] = (groups[date] ?? 0) + v
    }
    const entries = Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
    if (entries.length > 0) {
      const max = Math.max(...entries.map(([, v]) => v))
      return {
        data: entries.map(([date, v]) => ({
          label: date.length >= 5 ? date.slice(-5) : date,
          pct: max > 0 ? Math.round((v / max) * 100) : 0,
        })),
        hasDate: true,
      }
    }
  }

  if (nameCol && viewsCol) {
    const sorted = rankRowsByMetric(rows, nameCol, viewsCol).slice(0, 12)
    const max = sorted[0]?.value ?? 1
    return {
      data: sorted.map((r) => ({
        label: r.name.replace(/^@/, '').slice(0, 5),
        pct: max > 0 ? Math.round((r.value / max) * 100) : 0,
      })),
      hasDate: false,
    }
  }

  return { data: [], hasDate: false }
}

function buildContentPerformance(
  performance: CampaignDatabase | undefined,
  collectionRate = 0
): CampaignContentPerformanceSummary {
  const rows = performance?.rows ?? []
  const columns = performance?.columns ?? []

  const nameCol = findColumn(columns, ['계정명', 'name'], 'dimension')
  const viewsCol = findColumn(columns, ['조회수', 'views'], 'performance')
  const erCol = findColumn(columns, ['ER', 'er'], 'metric')
  const platformCol = findColumn(columns, ['플랫폼', 'platform'], 'platform')
  const formatCol = columns.find((c) => c.id === 'content_format' || c.name === '콘텐츠 형식')

  const totalViews = colSum(rows, viewsCol)

  const viewValues = viewsCol
    ? rows.map((row) => numericValue(row, viewsCol.id)).filter((v): v is number => v !== null)
    : []
  const avgViews = viewValues.length > 0 ? Math.round(average(viewValues)) : 0

  const erValues = rows
    .map((row) => (erCol ? numericValue(row, erCol.id) : computeInfluencerEr(row)))
    .filter((v): v is number => v !== null)
  const avgEr = erValues.length > 0 ? Math.round(average(erValues) * 100) / 100 : 0

  const top5ByViews =
    nameCol && viewsCol
      ? rankRowsByMetric(rows, nameCol, viewsCol)
          .slice(0, 5)
          .map((r) => ({ name: r.name, views: r.value }))
      : []

  const top5ByEr =
    nameCol && erCol
      ? rankRowsByMetric(rows, nameCol, erCol)
          .slice(0, 5)
          .map((r) => ({ name: r.name, er: r.value }))
      : []

  const PLATFORM_COLORS: Record<string, CampaignStatusProgress['color']> = {
    Instagram: 'blue',
    TikTok: 'green',
    YouTube: 'orange',
    X: 'gray',
  }

  const byPlatform = platformCol
    ? toProgressList(groupRowsByColumn(rows, platformCol), rows.length, PLATFORM_COLORS)
    : []

  const FORMAT_COLORS: Record<string, CampaignStatusProgress['color']> = {
    Reels: 'blue',
    Feed: 'green',
    TikTok: 'orange',
    Shorts: 'blue',
    Story: 'orange',
  }

  const byFormat = formatCol
    ? toProgressList(groupRowsByColumn(rows, formatCol), rows.length, FORMAT_COLORS)
    : []

  const { data: barData, hasDate } = buildBarData(performance)

  return {
    totalViews,
    uploadCount: rows.length,
    avgViews,
    avgEr,
    collectionRate,
    top5ByViews,
    top5ByEr,
    byPlatform,
    byFormat,
    barData,
    barMode: barData.length === 0 ? 'empty' : hasDate ? 'date' : 'influencer',
  }
}

function buildAdPerformance(meta: CampaignDatabase | undefined): CampaignAdPerformanceSummary {
  const rows = meta?.rows ?? []
  const columns = meta?.columns ?? []

  const spendCol      = findColumn(columns, ['Spend', 'spend'], 'cost')
  const impressionsCol = findColumn(columns, ['Impressions', 'impressions'], 'performance')
  const reachCol      = findColumn(columns, ['Reach', 'reach'], 'performance')
  const clicksCol     = findColumn(columns, ['Clicks', 'clicks'], 'performance')
  const ctrCol        = findColumn(columns, ['CTR', 'ctr'], 'metric')
  const cpcCol        = findColumn(columns, ['CPC', 'cpc'], 'metric')
  const cpmCol        = findColumn(columns, ['CPM', 'cpm'], 'metric')
  const conversionsCol = findColumn(columns, ['Conversions', 'conversions'], 'performance')
  const videoPlayCol  = findColumn(columns, ['Video Play', 'video_play'], 'performance')
  const thruPlayCol   = findColumn(columns, ['ThruPlay', 'thruplay'], 'performance')
  const levelCol      = findColumn(columns, ['Level', 'level'], 'dimension')
  const nameCol       = findColumn(columns, ['Name', 'name'], 'dimension')

  const totalSpend       = colSum(rows, spendCol)
  const totalImpressions = colSum(rows, impressionsCol)
  const totalReach       = colSum(rows, reachCol)
  const totalClicks      = colSum(rows, clicksCol)
  const totalConversions = colSum(rows, conversionsCol)
  const totalVideoPlay   = colSum(rows, videoPlayCol)
  const totalThruPlay    = colSum(rows, thruPlayCol)

  let ctr = 0
  if (ctrCol && totalImpressions > 0) {
    const weighted = rows.reduce((acc, row) => {
      const impr = impressionsCol ? (numericValue(row, impressionsCol.id) ?? 0) : 0
      const rowCtr = numericValue(row, ctrCol.id) ?? 0
      return acc + rowCtr * impr
    }, 0)
    ctr = weighted / totalImpressions
  } else if (totalImpressions > 0) {
    ctr = (totalClicks / totalImpressions) * 100
  }

  let cpc = 0
  if (cpcCol && totalClicks > 0) {
    const weighted = rows.reduce((acc, row) => {
      const clicks = clicksCol ? (numericValue(row, clicksCol.id) ?? 0) : 0
      const rowCpc = numericValue(row, cpcCol.id) ?? 0
      return acc + rowCpc * clicks
    }, 0)
    cpc = weighted / totalClicks
  } else if (totalClicks > 0) {
    cpc = totalSpend / totalClicks
  }

  let cpm = 0
  if (cpmCol && totalImpressions > 0) {
    const weighted = rows.reduce((acc, row) => {
      const impr = impressionsCol ? (numericValue(row, impressionsCol.id) ?? 0) : 0
      const rowCpm = numericValue(row, cpmCol.id) ?? 0
      return acc + rowCpm * impr
    }, 0)
    cpm = weighted / totalImpressions
  } else if (totalImpressions > 0) {
    cpm = (totalSpend / totalImpressions) * 1000
  }

  const LEVEL_COLORS: Record<string, CampaignStatusProgress['color']> = {
    campaign: 'blue',
    adset: 'green',
    ad: 'orange',
  }

  const byLevel = levelCol
    ? toProgressList(groupRowsByColumn(rows, levelCol), rows.length, LEVEL_COLORS)
    : []

  const top5BySpend =
    nameCol && spendCol
      ? rankRowsByMetric(rows, nameCol, spendCol)
          .slice(0, 5)
          .map((r) => ({ name: r.name, spend: r.value }))
      : []

  const top5ByCtr =
    nameCol && ctrCol
      ? rankRowsByMetric(rows, nameCol, ctrCol)
          .slice(0, 5)
          .map((r) => ({ name: r.name, ctr: r.value }))
      : []

  return {
    spend: totalSpend,
    impressions: totalImpressions,
    reach: totalReach,
    clicks: totalClicks,
    ctr,
    cpc,
    cpm,
    conversions: totalConversions,
    videoPlay: totalVideoPlay,
    thruPlay: totalThruPlay,
    byLevel,
    top5BySpend,
    top5ByCtr,
  }
}

function buildBudgetSummary(
  adBudget: CampaignDatabase | undefined,
  actualSpend: number
): CampaignBudgetSummary {
  const rows = adBudget?.rows ?? []
  const columns = adBudget?.columns ?? []
  const budgetCol = findColumn(columns, ['예산', 'budget'], 'cost')
  const plannedBudget = colSum(rows, budgetCol)
  const remainingBudget = plannedBudget - actualSpend
  const burnRate = plannedBudget > 0 ? (actualSpend / plannedBudget) * 100 : 0
  return { plannedBudget, actualSpend, remainingBudget, burnRate }
}

function buildDataQualitySummary(
  confirmedRows: CampaignDataRow[],
  performanceRows: CampaignDataRow[]
): CampaignDataQualitySummary {
  const confirmedCount = confirmedRows.length
  const performanceRowCount = performanceRows.length
  const performanceCollectionRate =
    confirmedCount > 0 ? (performanceRowCount / confirmedCount) * 100 : 0
  const confirmedWithoutPerformanceCount = Math.max(confirmedCount - performanceRowCount, 0)

  const warnings: string[] = []
  if (confirmedCount > 0 && performanceRowCount === 0) {
    warnings.push('확정 인원 대비 성과 데이터가 아직 입력되지 않았습니다.')
  } else if (confirmedCount > 0 && performanceCollectionRate < 70) {
    warnings.push('성과 수집률이 낮아 대시보드 해석에 주의가 필요합니다.')
  }

  return {
    confirmedCount,
    performanceRowCount,
    performanceCollectionRate,
    confirmedWithoutPerformanceCount,
    warnings,
  }
}

// ── Main overview builder ─────────────────────────────────────────

export function buildCampaignOverviewFromDatabases(databases: CampaignDatabase[]): CampaignOverview {
  const confirmed = databases.find((db) => db.businessType === 'confirmed_influencers')
  const performance = databases.find((db) => db.businessType === 'influencer_performance')
  const adBudget = databases.find((db) => db.businessType === 'ad_budget')
  const meta = databases.find((db) => db.businessType === 'meta_analytics')

  const confirmedRows = confirmed?.rows ?? []
  const performanceRows = performance?.rows ?? []

  // data quality comes first so we can pass collectionRate to content builder
  const dataQuality = buildDataQualitySummary(confirmedRows, performanceRows)
  const rosterProgress = buildRosterProgress(confirmed)
  const contentPerformance = buildContentPerformance(performance, dataQuality.performanceCollectionRate)
  const adPerformance = buildAdPerformance(meta)
  const budget = buildBudgetSummary(adBudget, adPerformance.spend)

  // Upload stats from confirmed_influencers
  const confirmedCols = confirmed?.columns ?? []
  const statusCol = findColumn(confirmedCols, ['현재 상태', 'status'], 'status')
  const uploadedCount = statusCol
    ? confirmedRows.filter((row) => row.cells[statusCol.id] === '업로드완료').length
    : 0
  const uploadRate =
    confirmedRows.length > 0 ? Math.round((uploadedCount / confirmedRows.length) * 100) : 0

  // Avg views/ER from influencer_performance only
  const performanceCols = performance?.columns ?? []
  const viewsCol = findColumn(performanceCols, ['조회수', 'views'], 'performance')
  const viewValues = viewsCol
    ? performanceRows
        .map((row) => numericValue(row, viewsCol.id))
        .filter((v): v is number => v !== null)
    : []
  const avgViews = viewValues.length > 0 ? Math.round(contentPerformance.avgViews) : 0

  const erCol = findColumn(performanceCols, ['ER', 'er'], 'metric')
  const erValues = performanceRows
    .map((row) => (erCol ? numericValue(row, erCol.id) : computeInfluencerEr(row)))
    .filter((v): v is number => v !== null)
  const avgEr = contentPerformance.avgEr

  const summary: CampaignDashboardSummary = {
    confirmedCount: confirmedRows.length,
    uploadedCount,
    uploadRate,
    performanceCollectionRate: dataQuality.performanceCollectionRate,
    avgViews,
    avgEr,
    metaSpend: adPerformance.spend,
    metaCtr: adPerformance.ctr,
    metaCpc: adPerformance.cpc,
    metaCpm: adPerformance.cpm,
    totalAdBudget: budget.plannedBudget,
    totalViews: contentPerformance.totalViews,
    adClicks: adPerformance.clicks,
  }

  const fmtN = (n: number) => n.toLocaleString()
  const fmtPct = (n: number) => `${n.toFixed(2)}%`

  const metrics: CampaignOverviewMetric[] = [
    {
      id: 'confirmed_count',
      label: '확정 인원 수',
      value: confirmedRows.length > 0 ? confirmedRows.length : '-',
      unit: confirmedRows.length > 0 ? '명' : undefined,
    },
    {
      id: 'upload_rate',
      label: '업로드 진행률',
      value: confirmedRows.length > 0 ? `${uploadRate}%` : '-',
      pill:
        confirmedRows.length > 0
          ? { text: `${uploadedCount} / ${confirmedRows.length}`, variant: 'flat' }
          : undefined,
    },
    {
      id: 'performance_collection_rate',
      label: '성과 수집률',
      value:
        confirmedRows.length > 0
          ? `${Math.round(dataQuality.performanceCollectionRate)}%`
          : '-',
      pill:
        confirmedRows.length > 0
          ? {
              text: `${performanceRows.length}건`,
              variant: dataQuality.performanceCollectionRate >= 70 ? 'up' : 'warn',
            }
          : undefined,
    },
    {
      id: 'avg_views',
      label: '평균 조회수',
      value: viewValues.length > 0 ? fmtN(avgViews) : '-',
    },
    {
      id: 'avg_er',
      label: '평균 ER',
      value: erValues.length > 0 ? `${avgEr}%` : '-',
      pill:
        erValues.length > 0
          ? { text: avgEr >= 4 ? '양호' : '점검', variant: avgEr >= 4 ? 'up' : 'warn' }
          : undefined,
    },
    {
      id: 'meta_spend',
      label: 'Meta 광고비',
      value: adPerformance.spend > 0 ? fmtN(adPerformance.spend) : '-',
      pill:
        budget.plannedBudget > 0
          ? { text: `${Math.round(budget.burnRate)}% 소진`, variant: 'flat' }
          : undefined,
    },
    {
      id: 'meta_ctr',
      label: '광고 CTR',
      value: adPerformance.ctr > 0 ? fmtPct(adPerformance.ctr) : '-',
      pill:
        adPerformance.ctr > 0
          ? {
              text: adPerformance.ctr >= 1.5 ? '양호' : '관찰',
              variant: adPerformance.ctr >= 1.5 ? 'up' : 'warn',
            }
          : undefined,
    },
    {
      id: 'meta_cpc',
      label: '광고 CPC',
      value: adPerformance.cpc > 0 ? fmtN(Math.round(adPerformance.cpc)) : '-',
      pill: adPerformance.cpc > 0 ? { text: '클릭 단가', variant: 'flat' } : undefined,
    },
    {
      id: 'meta_cpm',
      label: '광고 CPM',
      value: adPerformance.cpm > 0 ? fmtN(Math.round(adPerformance.cpm)) : '-',
      pill: adPerformance.cpm > 0 ? { text: '노출 단가', variant: 'flat' } : undefined,
    },
  ]

  // Charts: confirmed + performance (content only) + meta (ad only)
  // candidate_confirmation_rate chart is NOT generated
  const charts: CampaignOverviewChart[] = [
    ...(confirmed ? buildDatabaseChartRecommendations(confirmed) : []),
    ...(performance ? buildDatabaseChartRecommendations(performance) : []),
    ...(meta ? buildDatabaseChartRecommendations(meta) : []),
  ]

  return {
    metrics,
    charts,
    summary,
    contentPerformance,
    adPerformance,
    rosterProgress,
    budget,
    dataQuality,
  }
}
