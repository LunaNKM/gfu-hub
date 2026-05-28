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
  CampaignContentPerformanceRow,
  CampaignAdPerformanceRow,
  CampaignRosterDetailRow,
  CampaignCandidateDetailRow,
  CampaignBudgetDetailRow,
  CampaignDetailTabSummary,
  CampaignDetailTables,
} from '@/types'
import type { CampaignMetaInsightSnapshot } from '@/types/campaignMeta'
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

// ── Detail tables builder ─────────────────────────────────────────

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function buildDetailTables(databases: CampaignDatabase[]): CampaignDetailTables {
  const confirmed   = databases.find((db) => db.businessType === 'confirmed_influencers')
  const candidates  = databases.find((db) => db.businessType === 'influencer_candidates')
  const performance = databases.find((db) => db.businessType === 'influencer_performance')
  const adBudget    = databases.find((db) => db.businessType === 'ad_budget')
  const meta        = databases.find((db) => db.businessType === 'meta_analytics')

  // ── Post tab ───────────────────────────────────────────────────
  const perfRows = performance?.rows ?? []
  const perfCols = performance?.columns ?? []
  const pfName      = findColumn(perfCols, ['계정명', 'name'], 'dimension')
  const pfPlatform  = findColumn(perfCols, ['플랫폼', 'platform'], 'platform')
  const pfCategory  = findColumn(perfCols, ['카테고리', 'category'], 'dimension')
  const pfFollowers = findColumn(perfCols, ['팔로워 수', 'followers'], 'metric')
  const pfViews     = findColumn(perfCols, ['조회수', 'views'], 'performance')
  const pfLikes     = findColumn(perfCols, ['좋아요', 'likes'], 'performance')
  const pfSaves     = findColumn(perfCols, ['저장', 'saves'], 'performance')
  const pfComments  = findColumn(perfCols, ['댓글', 'comments'], 'performance')
  const pfShares    = findColumn(perfCols, ['공유', 'shares'], 'performance')
  const pfEr        = findColumn(perfCols, ['ER', 'er'], 'metric')
  const pfFormat    = perfCols.find((c) => c.id === 'content_format' || c.name === '콘텐츠 형식')

  const post: CampaignContentPerformanceRow[] = [...perfRows]
    .sort((a, b) => (pfViews ? (numericValue(b, pfViews.id) ?? 0) - (numericValue(a, pfViews.id) ?? 0) : 0))
    .map((row) => ({
      name:      String(row.cells[pfName?.id     ?? ''] ?? ''),
      platform:  String(row.cells[pfPlatform?.id ?? ''] ?? ''),
      format:    pfFormat ? String(row.cells[pfFormat.id] ?? '') : '',
      category:  String(row.cells[pfCategory?.id ?? ''] ?? ''),
      followers: pfFollowers ? numericValue(row, pfFollowers.id) : null,
      views:     pfViews     ? numericValue(row, pfViews.id)     : null,
      likes:     pfLikes     ? numericValue(row, pfLikes.id)     : null,
      saves:     pfSaves     ? numericValue(row, pfSaves.id)     : null,
      comments:  pfComments  ? numericValue(row, pfComments.id)  : null,
      shares:    pfShares    ? numericValue(row, pfShares.id)    : null,
      er:        pfEr        ? numericValue(row, pfEr.id) : computeInfluencerEr(row),
    }))

  const maxViews  = Math.max(...post.map((r) => r.views  ?? 0), 1)
  const maxEr     = Math.max(...post.map((r) => r.er     ?? 0), 0.01)
  const maxSaves  = Math.max(...post.map((r) => r.saves  ?? 0), 1)
  const topByEr   = [...post].sort((a, b) => (b.er ?? 0)    - (a.er ?? 0))[0]
  const topBySaves = [...post].sort((a, b) => (b.saves ?? 0) - (a.saves ?? 0))[0]

  const postSummary: CampaignDetailTabSummary[] = post.length > 0 ? [
    { label: '조회수 Top', pct: 100,   value: fmtCompact(maxViews),                    color: 'blue'   },
    { label: 'ER Top',    pct: Math.round(Math.min(100, ((topByEr?.er ?? 0) / maxEr) * 100)),   value: `${(topByEr?.er ?? 0).toFixed(1)}%`,   color: 'green'  },
    { label: '저장 Top',  pct: Math.round(Math.min(100, ((topBySaves?.saves ?? 0) / maxSaves) * 100)), value: fmtCompact(topBySaves?.saves ?? 0), color: 'orange' },
  ] : []

  // ── Ad tab ─────────────────────────────────────────────────────
  const metaRows = meta?.rows ?? []
  const metaCols = meta?.columns ?? []
  const maLevel        = findColumn(metaCols, ['Level', 'level'], 'dimension')
  const maName         = findColumn(metaCols, ['Name', 'name'], 'dimension')
  const maSpend        = findColumn(metaCols, ['Spend', 'spend'], 'cost')
  const maImpressions  = findColumn(metaCols, ['Impressions', 'impressions'], 'performance')
  const maReach        = findColumn(metaCols, ['Reach', 'reach'], 'performance')
  const maClicks       = findColumn(metaCols, ['Clicks', 'clicks'], 'performance')
  const maCtr          = findColumn(metaCols, ['CTR', 'ctr'], 'metric')
  const maCpc          = findColumn(metaCols, ['CPC', 'cpc'], 'metric')
  const maCpm          = findColumn(metaCols, ['CPM', 'cpm'], 'metric')
  const maThruPlay     = findColumn(metaCols, ['ThruPlay', 'thruplay'], 'performance')
  // Meta API snapshot 확장 필드 (현재 수동 DB에 없을 수 있음 — 모두 optional)
  const maMetaObjectId  = metaCols.find((c) => ['metaObjectId', 'meta_object_id'].includes(c.id) || c.name === 'Meta Object ID')
  const maMetaAccountId = metaCols.find((c) => ['metaAccountId', 'meta_account_id'].includes(c.id) || c.name === 'Meta Account ID')
  const maDateStart     = metaCols.find((c) => ['dateStart', 'date_start'].includes(c.id) || c.name === 'Date Start')
  const maDateStop      = metaCols.find((c) => ['dateStop', 'date_stop'].includes(c.id) || c.name === 'Date Stop')
  const maCurrency      = metaCols.find((c) => c.id === 'currency' || c.name === 'Currency')
  const maFetchedAt     = metaCols.find((c) => ['fetchedAt', 'fetched_at'].includes(c.id) || c.name === 'Fetched At')
  const maSourceHash    = metaCols.find((c) => ['sourceHash', 'source_hash'].includes(c.id) || c.name === 'Source Hash')

  const ad: CampaignAdPerformanceRow[] = [...metaRows]
    .sort((a, b) => (maSpend ? (numericValue(b, maSpend.id) ?? 0) - (numericValue(a, maSpend.id) ?? 0) : 0))
    .map((row) => ({
      level:        String(row.cells[maLevel?.id ?? ''] ?? ''),
      name:         String(row.cells[maName?.id  ?? ''] ?? ''),
      spend:        maSpend       ? numericValue(row, maSpend.id)       : null,
      impressions:  maImpressions ? numericValue(row, maImpressions.id) : null,
      reach:        maReach       ? numericValue(row, maReach.id)       : null,
      clicks:       maClicks      ? numericValue(row, maClicks.id)      : null,
      ctr:          maCtr         ? numericValue(row, maCtr.id)         : null,
      cpc:          maCpc         ? numericValue(row, maCpc.id)         : null,
      cpm:          maCpm         ? numericValue(row, maCpm.id)         : null,
      thruPlay:     maThruPlay    ? numericValue(row, maThruPlay.id)    : null,
      metaObjectId:  maMetaObjectId  ? String(row.cells[maMetaObjectId.id]  ?? '') || undefined : undefined,
      metaAccountId: maMetaAccountId ? String(row.cells[maMetaAccountId.id] ?? '') || undefined : undefined,
      dateStart:     maDateStart     ? String(row.cells[maDateStart.id]     ?? '') || undefined : undefined,
      dateStop:      maDateStop      ? String(row.cells[maDateStop.id]      ?? '') || undefined : undefined,
      currency:      maCurrency      ? String(row.cells[maCurrency.id]      ?? '') || undefined : undefined,
      fetchedAt:     maFetchedAt     ? String(row.cells[maFetchedAt.id]     ?? '') || undefined : undefined,
      sourceHash:    maSourceHash    ? String(row.cells[maSourceHash.id]    ?? '') || undefined : undefined,
    }))

  const maxSpend = Math.max(...ad.map((r) => r.spend ?? 0), 1)
  const maxCtr   = Math.max(...ad.map((r) => r.ctr   ?? 0), 0.01)
  const maxCpc   = Math.max(...ad.map((r) => r.cpc   ?? 0), 1)
  const topByCtr = [...ad].sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0))[0]
  const topByCpc = [...ad].sort((a, b) => (b.cpc ?? 0) - (a.cpc ?? 0))[0]

  const adSummary: CampaignDetailTabSummary[] = ad.length > 0 ? [
    { label: 'Spend Top', pct: 100, value: fmtCompact(maxSpend), color: 'blue' },
    { label: 'CTR Top',   pct: Math.round(Math.min(100, ((topByCtr?.ctr ?? 0) / maxCtr) * 100)), value: `${(topByCtr?.ctr ?? 0).toFixed(2)}%`, color: 'green'  },
    { label: 'CPC Watch', pct: Math.round(Math.min(100, ((topByCpc?.cpc ?? 0) / maxCpc) * 100)), value: fmtCompact(topByCpc?.cpc ?? 0),        color: 'orange' },
  ] : []

  // ── Confirmed tab ──────────────────────────────────────────────
  const confRows = confirmed?.rows ?? []
  const confCols = confirmed?.columns ?? []
  const cfName      = findColumn(confCols, ['계정명', 'name'], 'dimension')
  const cfPlatform  = findColumn(confCols, ['플랫폼', 'platform'], 'platform')
  const cfCategory  = findColumn(confCols, ['카테고리', 'category'], 'dimension')
  const cfFollowers = findColumn(confCols, ['팔로워 수', 'followers'], 'metric')
  const cfStatus    = findColumn(confCols, ['현재 상태', 'status'], 'status')
  const cfNote      = findColumn(confCols, ['비고', 'note'])
  const cfUrl       = confCols.find((c) => c.type === 'url')

  const STATUS_ORDER = ['업로드완료', '검수중', '초안대기', '계약완료', '계약전']
  const confirmedRows: CampaignRosterDetailRow[] = [...confRows]
    .sort((a, b) => {
      const ai = cfStatus ? STATUS_ORDER.indexOf(String(a.cells[cfStatus.id] ?? '')) : -1
      const bi = cfStatus ? STATUS_ORDER.indexOf(String(b.cells[cfStatus.id] ?? '')) : -1
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    })
    .map((row) => ({
      name:      String(row.cells[cfName?.id      ?? ''] ?? ''),
      platform:  String(row.cells[cfPlatform?.id  ?? ''] ?? ''),
      category:  String(row.cells[cfCategory?.id  ?? ''] ?? ''),
      followers: cfFollowers ? numericValue(row, cfFollowers.id) : null,
      status:    String(row.cells[cfStatus?.id    ?? ''] ?? ''),
      note:      String(row.cells[cfNote?.id      ?? ''] ?? ''),
      url:       cfUrl ? String(row.cells[cfUrl.id] ?? '') : '',
    }))

  const totalConf   = confirmedRows.length
  const uploadedCf  = confirmedRows.filter((r) => r.status === '업로드완료').length
  const reviewCf    = confirmedRows.filter((r) => r.status === '검수중').length
  const draftCf     = confirmedRows.filter((r) => r.status === '초안대기').length

  const confirmedSummary: CampaignDetailTabSummary[] = totalConf > 0 ? [
    { label: '업로드완료', pct: Math.round((uploadedCf / totalConf) * 100), value: `${uploadedCf}명`,  color: 'green'  },
    { label: '검수중',     pct: Math.round((reviewCf  / totalConf) * 100), value: `${reviewCf}명`,    color: 'blue'   },
    { label: '초안대기',   pct: Math.round((draftCf   / totalConf) * 100), value: `${draftCf}명`,     color: 'orange' },
  ] : []

  // ── Candidates tab ─────────────────────────────────────────────
  const candRows = candidates?.rows ?? []
  const candCols = candidates?.columns ?? []
  const caName      = findColumn(candCols, ['계정명', 'name'], 'dimension')
  const caPlatform  = findColumn(candCols, ['플랫폼', 'platform'], 'platform')
  const caCategory  = findColumn(candCols, ['카테고리', 'category'], 'dimension')
  const caFollowers = findColumn(candCols, ['팔로워 수', 'followers'], 'metric')
  const caConfirmed = findColumn(candCols, ['확정 여부', 'confirmed'], 'status')
  const caNote      = findColumn(candCols, ['비고', 'note'])
  const caUrl       = candCols.find((c) => c.type === 'url')

  const candidatesRows: CampaignCandidateDetailRow[] = candRows.map((row) => {
    const rawConf = row.cells[caConfirmed?.id ?? '']
    const confirmed = rawConf === true || rawConf === '확정' ? '확정' : '미확정'
    return {
      name:      String(row.cells[caName?.id      ?? ''] ?? ''),
      platform:  String(row.cells[caPlatform?.id  ?? ''] ?? ''),
      category:  String(row.cells[caCategory?.id  ?? ''] ?? ''),
      followers: caFollowers ? numericValue(row, caFollowers.id) : null,
      confirmed,
      note:      String(row.cells[caNote?.id      ?? ''] ?? ''),
      url:       caUrl ? String(row.cells[caUrl.id] ?? '') : '',
    }
  })

  const totalCand     = candidatesRows.length
  const confirmedCand = candidatesRows.filter((r) => r.confirmed === '확정').length
  const pendingCand   = candidatesRows.filter((r) => r.confirmed !== '확정' && r.note).length

  const candidatesSummary: CampaignDetailTabSummary[] = totalCand > 0 ? [
    { label: '후보자 수',  pct: 85, value: `${totalCand}명`,     color: 'blue'   },
    { label: '확정 후보', pct: Math.round((confirmedCand / totalCand) * 100), value: `${confirmedCand}명`, color: 'green'  },
    { label: '협의 필요', pct: Math.round((pendingCand   / totalCand) * 100), value: `${pendingCand}명`,  color: 'orange' },
  ] : []

  // ── Budget tab ─────────────────────────────────────────────────
  const budRows = adBudget?.rows ?? []
  const budCols = adBudget?.columns ?? []
  const bdItem     = findColumn(budCols, ['항목', 'item'], 'dimension')
  const bdChannel  = findColumn(budCols, ['채널', 'channel'], 'platform')
  const bdPurpose  = findColumn(budCols, ['목적', 'purpose'], 'dimension')
  const bdBudget   = findColumn(budCols, ['예산', 'budget'], 'cost')
  const bdEstCpm   = findColumn(budCols, ['예상 CPM', 'est_cpm'], 'metric')
  const bdEstCpc   = findColumn(budCols, ['예상 CPC', 'est_cpc'], 'metric')
  const bdEstImpr  = findColumn(budCols, ['예상 노출', 'est_impr'], 'metric')
  const bdEstClick = findColumn(budCols, ['예상 클릭', 'est_click'], 'metric')
  const bdNote     = findColumn(budCols, ['비고', 'note'])

  const budgetRows: CampaignBudgetDetailRow[] = budRows.map((row) => ({
    item:     String(row.cells[bdItem?.id     ?? ''] ?? ''),
    channel:  String(row.cells[bdChannel?.id  ?? ''] ?? ''),
    purpose:  String(row.cells[bdPurpose?.id  ?? ''] ?? ''),
    budget:   bdBudget   ? numericValue(row, bdBudget.id)   : null,
    estCpm:   bdEstCpm   ? numericValue(row, bdEstCpm.id)   : null,
    estCpc:   bdEstCpc   ? numericValue(row, bdEstCpc.id)   : null,
    estImpr:  bdEstImpr  ? numericValue(row, bdEstImpr.id)  : null,
    estClick: bdEstClick ? numericValue(row, bdEstClick.id) : null,
    note:     String(row.cells[bdNote?.id     ?? ''] ?? ''),
  }))

  const totalBudget = budgetRows.reduce((acc, r) => acc + (r.budget ?? 0), 0)
  const byChannel = budgetRows.reduce((acc, r) => {
    if (r.channel) acc[r.channel] = (acc[r.channel] ?? 0) + (r.budget ?? 0)
    return acc
  }, {} as Record<string, number>)
  const topChannels = Object.entries(byChannel).sort(([, a], [, b]) => b - a)

  const budgetSummary: CampaignDetailTabSummary[] = totalBudget > 0 ? [
    { label: '예산 합계', pct: 100, value: fmtCompact(totalBudget), color: 'blue' },
    ...(topChannels[0] ? [{ label: `${topChannels[0][0]} 비중`, pct: Math.round((topChannels[0][1] / totalBudget) * 100), value: fmtCompact(topChannels[0][1]), color: 'green'  as const }] : []),
    ...(topChannels[1] ? [{ label: `${topChannels[1][0]} 비중`, pct: Math.round((topChannels[1][1] / totalBudget) * 100), value: fmtCompact(topChannels[1][1]), color: 'orange' as const }] : []),
  ] : []

  // ── Meta spend spark (relative pct from ad rows sorted by spend) ─
  const sparkRaw = ad.slice(0, 7).map((r) => r.spend ?? 0)
  const sparkMax = Math.max(...sparkRaw, 1)
  const metaSpendSpark = sparkRaw.map((v) => Math.max(8, Math.round((v / sparkMax) * 100)))

  return {
    post,
    ad,
    confirmed: confirmedRows,
    candidates: candidatesRows,
    budget: budgetRows,
    postSummary,
    adSummary,
    confirmedSummary,
    candidatesSummary,
    budgetSummary,
    postNote: '인플루언서 성과 DB의 조회수, 좋아요, 저장, 댓글, ER만 사용합니다. 광고 지표와 섞지 않습니다.',
    adNote: 'Meta Analytics DB의 level, spend, impressions, clicks, CTR, CPC, CPM, ThruPlay만 사용합니다. 게시물 반응 수와 분리합니다.',
    confirmedNote: '확정 인원 리스트 DB의 status, platform, category를 기준으로 진행률과 구성 비율을 만듭니다.',
    candidatesNote: '후보자 DB는 파이프라인 관리용입니다. 메인 KPI보다는 후보 풀의 규모와 플랫폼/카테고리 분포에 쓰는 것이 좋습니다.',
    budgetNote: '광고 예산안 DB는 계획값입니다. 실제 광고 성과는 Meta Analytics DB와 비교해서 예산 대비 집행률로 보여주는 것이 좋습니다.',
    metaSpendSpark,
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

  const detailTables = buildDetailTables(databases)

  return {
    metrics,
    charts,
    summary,
    contentPerformance,
    adPerformance,
    rosterProgress,
    budget,
    dataQuality,
    detailTables,
  }
}

// ── Snapshot-aware overview builder ──────────────────────────────
// Accepts metaSnapshots for ad performance when available.
// Falls back to meta_analytics database when snapshots are empty.

function buildAdPerformanceFromSnapshots(
  snapshots: CampaignMetaInsightSnapshot[]
): CampaignAdPerformanceSummary {
  const totalSpend       = snapshots.reduce((a, s) => a + s.spend,       0)
  const totalImpressions = snapshots.reduce((a, s) => a + s.impressions, 0)
  const totalReach       = snapshots.reduce((a, s) => a + s.reach,       0)
  const totalClicks      = snapshots.reduce((a, s) => a + s.clicks,      0)
  const totalConversions = snapshots.reduce((a, s) => a + s.conversions, 0)
  const totalVideoPlay   = snapshots.reduce((a, s) => a + s.videoPlay,   0)
  const totalThruPlay    = snapshots.reduce((a, s) => a + s.thruPlay,    0)

  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  const cpc = totalClicks      > 0 ? totalSpend / totalClicks           : 0
  const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0

  const LEVEL_COLORS: Record<string, CampaignStatusProgress['color']> = {
    campaign: 'blue',
    adset: 'green',
    ad: 'orange',
  }
  const levelGroups: Record<string, number> = {}
  for (const s of snapshots) {
    levelGroups[s.level] = (levelGroups[s.level] ?? 0) + 1
  }
  const total = snapshots.length
  const byLevel: CampaignStatusProgress[] = Object.entries(levelGroups).map(([name, count]) => ({
    name,
    count,
    pct: total > 0 ? Math.round((count / total) * 100) : 0,
    color: LEVEL_COLORS[name] ?? 'gray',
  }))

  const top5BySpend = [...snapshots]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5)
    .map((s) => ({ name: s.metaObjectName || s.metaObjectId, spend: s.spend }))

  const top5ByCtr = [...snapshots]
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, 5)
    .map((s) => ({ name: s.metaObjectName || s.metaObjectId, ctr: s.ctr }))

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

export function buildCampaignOverviewFromSources(params: {
  databases: CampaignDatabase[]
  metaSnapshots?: CampaignMetaInsightSnapshot[]
}): CampaignOverview {
  const { databases, metaSnapshots } = params

  if (metaSnapshots && metaSnapshots.length > 0) {
    // Use snapshot-based ad performance; everything else comes from databases.
    const baseOverview = buildCampaignOverviewFromDatabases(databases)
    const adPerformance = buildAdPerformanceFromSnapshots(metaSnapshots)

    const adBudget = databases.find((db) => db.businessType === 'ad_budget')
    const budget = buildBudgetSummary(adBudget, adPerformance.spend)

    const summary: CampaignDashboardSummary = {
      ...baseOverview.summary!,
      metaSpend: adPerformance.spend,
      metaCtr: adPerformance.ctr,
      metaCpc: adPerformance.cpc,
      metaCpm: adPerformance.cpm,
      totalAdBudget: budget.plannedBudget,
      adClicks: adPerformance.clicks,
    }

    const fmtN = (n: number) => n.toLocaleString()
    const fmtPct = (n: number) => `${n.toFixed(2)}%`

    const updatedMetrics = baseOverview.metrics.map((m): CampaignOverviewMetric => {
      if (m.id === 'meta_spend') {
        return {
          ...m,
          value: adPerformance.spend > 0 ? fmtN(adPerformance.spend) : '-',
          pill: budget.plannedBudget > 0
            ? { text: `${Math.round(budget.burnRate)}% 소진`, variant: 'flat' }
            : undefined,
        }
      }
      if (m.id === 'meta_ctr') {
        return {
          ...m,
          value: adPerformance.ctr > 0 ? fmtPct(adPerformance.ctr) : '-',
          pill: adPerformance.ctr > 0
            ? { text: adPerformance.ctr >= 1.5 ? '양호' : '관찰', variant: adPerformance.ctr >= 1.5 ? 'up' : 'warn' }
            : undefined,
        }
      }
      if (m.id === 'meta_cpc') {
        return {
          ...m,
          value: adPerformance.cpc > 0 ? fmtN(Math.round(adPerformance.cpc)) : '-',
        }
      }
      if (m.id === 'meta_cpm') {
        return {
          ...m,
          value: adPerformance.cpm > 0 ? fmtN(Math.round(adPerformance.cpm)) : '-',
        }
      }
      return m
    })

    return {
      ...baseOverview,
      metrics: updatedMetrics,
      adPerformance,
      budget,
      summary,
    }
  }

  // No snapshots — fall back to database-based overview
  return buildCampaignOverviewFromDatabases(databases)
}
