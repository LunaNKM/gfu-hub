import { CampaignDatabase, CampaignDataColumn, CampaignDataRow, CampaignOverview, CampaignOverviewChart, CampaignOverviewMetric } from '@/types'
import { computeInfluencerEr } from './databaseTemplates'

// ── 헬퍼 ─────────────────────────────────────────────────────────

function findColByRole(cols: CampaignDataColumn[], role: string): CampaignDataColumn | undefined {
  return cols.find((c) => c.role === role)
}

function findColByName(cols: CampaignDataColumn[], ...names: string[]): CampaignDataColumn | undefined {
  return cols.find((c) => names.some((n) => c.name === n || c.id === n))
}

function numericVal(row: CampaignDataRow, colId: string): number | null {
  const v = row.cells[colId]
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return isNaN(n) ? null : n
}

function avg(vals: number[]): number {
  if (vals.length === 0) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function groupBy(
  rows: CampaignDataRow[],
  colId: string
): { name: string; value: number }[] {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const val = String(row.cells[colId] ?? '미입력')
    counts[val] = (counts[val] ?? 0) + 1
  }
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

// ── 메인 ─────────────────────────────────────────────────────────

export function buildCampaignOverview(databases: CampaignDatabase[]): CampaignOverview {
  const confirmed = databases.find((d) => d.businessType === 'confirmed_influencers')
  const performance = databases.find((d) => d.businessType === 'influencer_performance')
  const candidates = databases.find((d) => d.businessType === 'influencer_candidates')
  const adBudget = databases.find((d) => d.businessType === 'ad_budget')

  const confirmedRows = confirmed?.rows ?? []
  const performanceRows = performance?.rows ?? []
  const candidateRows = candidates?.rows ?? []

  // ── KPI 계산 ──────────────────────────────────────────────────

  // 확정 인원 수
  const confirmedCount = confirmedRows.length

  // 업로드 완료 진행률
  const statusCol = confirmed
    ? findColByName(confirmed.columns, '현재 상태', 'status')
    : undefined
  const uploadedCount = statusCol
    ? confirmedRows.filter((r) => r.cells[statusCol.id] === '업로드완료').length
    : 0
  const uploadRate =
    confirmedCount > 0 ? Math.round((uploadedCount / confirmedCount) * 100) : 0

  // 평균 조회수
  const viewsCol = performance
    ? findColByName(performance.columns, '조회수', 'views') ??
      findColByRole(performance.columns, 'performance')
    : undefined
  const viewValues = viewsCol
    ? performanceRows.map((r) => numericVal(r, viewsCol.id)).filter((v): v is number => v !== null)
    : []
  const avgViews = Math.round(avg(viewValues))

  // 평균 ER
  const erValues = performanceRows
    .map((r) => {
      const erCol = performance ? findColByName(performance.columns, 'ER', 'er') : undefined
      if (erCol) {
        const v = numericVal(r, erCol.id)
        if (v !== null) return v
      }
      return computeInfluencerEr(r)
    })
    .filter((v): v is number => v !== null)
  const avgEr = erValues.length > 0 ? Math.round(avg(erValues) * 100) / 100 : 0

  // 광고 예산 합계
  const budgetCol = adBudget
    ? findColByName(adBudget.columns, '예산', 'budget') ??
      findColByRole(adBudget.columns, 'cost')
    : undefined
  const totalBudget = budgetCol
    ? (adBudget?.rows ?? [])
        .map((r) => numericVal(r, budgetCol.id))
        .filter((v): v is number => v !== null)
        .reduce((a, b) => a + b, 0)
    : 0

  const metrics: CampaignOverviewMetric[] = [
    {
      id: 'confirmed_count',
      label: '확정 인원',
      value: confirmedCount,
      unit: '명',
    },
    {
      id: 'upload_rate',
      label: '업로드 진행률',
      value: confirmedCount > 0 ? `${uploadRate}%` : '-',
      hint: confirmedCount === 0 ? '확정 인원 데이터 없음' : undefined,
    },
    {
      id: 'avg_views',
      label: '평균 조회수',
      value: viewValues.length > 0 ? avgViews.toLocaleString() : '-',
      hint: viewValues.length === 0 ? '성과 데이터 없음' : undefined,
    },
    {
      id: 'avg_er',
      label: '평균 ER',
      value: erValues.length > 0 ? `${avgEr}%` : '-',
      hint: erValues.length === 0 ? '성과 데이터 없음' : undefined,
    },
    {
      id: 'meta_spend',
      label: 'Meta 광고비',
      value: '-',
      hint: 'Meta 연동 후 표시',
    },
    {
      id: 'meta_ctr',
      label: 'Meta CTR',
      value: '-',
      hint: 'Meta 연동 후 표시',
    },
    {
      id: 'meta_cpc',
      label: 'Meta CPC',
      value: '-',
      hint: 'Meta 연동 후 표시',
    },
    {
      id: 'meta_cpm',
      label: 'Meta CPM',
      value: '-',
      hint: 'Meta 연동 후 표시',
    },
    ...(totalBudget > 0
      ? [{ id: 'total_ad_budget', label: '광고 예산 합계', value: `₩${totalBudget.toLocaleString()}` }]
      : []),
  ]

  // ── 차트 계산 ──────────────────────────────────────────────────

  const charts: CampaignOverviewChart[] = []

  // 1. 상태별 진행 현황 (confirmed_influencers)
  if (statusCol && confirmedRows.length > 0) {
    charts.push({
      id: 'status_distribution',
      title: '콘텐츠 진행 현황',
      type: 'bar',
      data: groupBy(confirmedRows, statusCol.id),
    })
  }

  // 2. 플랫폼별 확정 인원 수
  const confirmedPlatformCol = confirmed
    ? findColByName(confirmed.columns, '플랫폼', 'platform') ??
      findColByRole(confirmed.columns, 'platform')
    : undefined
  if (confirmedPlatformCol && confirmedRows.length > 0) {
    charts.push({
      id: 'platform_distribution',
      title: '플랫폼별 확정 인원',
      type: 'pie',
      data: groupBy(confirmedRows, confirmedPlatformCol.id),
    })
  }

  // 3. 카테고리 비율
  const sourcesForCategory = confirmedRows.length > 0 ? confirmed : candidates
  const categoryCol = sourcesForCategory
    ? findColByName(sourcesForCategory.columns, '카테고리', 'category') ??
      findColByRole(sourcesForCategory.columns, 'dimension')
    : undefined
  if (categoryCol && (sourcesForCategory?.rows.length ?? 0) > 0) {
    charts.push({
      id: 'category_distribution',
      title: '카테고리 비율',
      type: 'pie',
      data: groupBy(sourcesForCategory!.rows, categoryCol.id),
    })
  }

  // 4. 조회수 상위 인플루언서
  if (viewsCol && performanceRows.length > 0) {
    const nameCol = performance
      ? findColByName(performance.columns, '계정명', 'name')
      : undefined
    if (nameCol) {
      const ranked = [...performanceRows]
        .filter((r) => numericVal(r, viewsCol.id) !== null)
        .sort((a, b) => (numericVal(b, viewsCol.id) ?? 0) - (numericVal(a, viewsCol.id) ?? 0))
        .slice(0, 10)
        .map((r) => ({
          name: String(r.cells[nameCol.id] ?? '미입력'),
          value: numericVal(r, viewsCol.id) ?? 0,
        }))
      if (ranked.length > 0) {
        charts.push({
          id: 'top_views',
          title: '조회수 상위 인플루언서',
          type: 'ranking',
          data: ranked,
        })
      }
    }
  }

  // 5. ER 상위 인플루언서
  if (erValues.length > 0 && performance) {
    const nameCol = findColByName(performance.columns, '계정명', 'name')
    const erCol = findColByName(performance.columns, 'ER', 'er')
    if (nameCol && erCol) {
      const ranked = [...performanceRows]
        .filter((r) => numericVal(r, erCol.id) !== null)
        .sort((a, b) => (numericVal(b, erCol.id) ?? 0) - (numericVal(a, erCol.id) ?? 0))
        .slice(0, 10)
        .map((r) => ({
          name: String(r.cells[nameCol.id] ?? '미입력'),
          value: numericVal(r, erCol.id) ?? 0,
        }))
      if (ranked.length > 0) {
        charts.push({
          id: 'top_er',
          title: 'ER 상위 인플루언서',
          type: 'ranking',
          data: ranked,
        })
      }
    }
  }

  // 6. 후보자 중 확정 비율 (candidates)
  const confirmedCheckCol = candidates
    ? findColByName(candidates.columns, '확정 여부', 'confirmed')
    : undefined
  if (confirmedCheckCol && candidateRows.length > 0) {
    const confirmedInCandidates = candidateRows.filter((r) => r.cells[confirmedCheckCol.id] === true).length
    charts.push({
      id: 'candidate_confirmation_rate',
      title: '후보자 확정 현황',
      type: 'pie',
      data: [
        { name: '확정', value: confirmedInCandidates },
        { name: '미확정', value: candidateRows.length - confirmedInCandidates },
      ].filter((d) => d.value > 0),
    })
  }

  return { metrics, charts }
}
