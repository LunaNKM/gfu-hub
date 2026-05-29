'use client'

import React, { useMemo, useState } from 'react'
import type { CampaignOverview } from '@/types'
import type {
  CampaignAdPerformanceRow,
  CampaignMetaAudienceRow,
  CampaignMetaHourlyRow,
  CampaignMetaPlacementRow,
} from '@/types/campaignDashboard'
import styles from './CampaignMetaDashboardTab.module.css'

type MetaInnerTab = 'overview' | 'audience' | 'placement' | 'video' | 'fatigue' | 'hourly'
type TrendMode = 'ctr' | 'clicks' | 'spend'
type HourlyMetric = 'ctr' | 'clicks' | 'spend'

interface Props {
  overview: CampaignOverview
  onOpenMetaSettings: () => void
}

// ── Formatters ────────────────────────────────────────────────────

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function fmtMoney(n: number): string {
  return `₩${Math.round(n).toLocaleString()}`
}

function fmtRate(n: number | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? `${n.toFixed(2)}%` : '-'
}

function hasNumber(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

// ── KPI tint colors (per position) ───────────────────────────────

const KPI_TINTS = [
  '#edf4ff',
  '#e9f8f1',
  '#f3edff',
  '#fff6e7',
  '#eff6ff',
  '#f1f5f9',
]

// ── Component ─────────────────────────────────────────────────────

export function CampaignMetaDashboardTab({ overview, onOpenMetaSettings }: Props) {
  const [innerTab, setInnerTab] = useState<MetaInnerTab>('overview')
  const [trendMode, setTrendMode] = useState<TrendMode>('ctr')
  const [hourlyMetric, setHourlyMetric] = useState<HourlyMetric>('ctr')
  const [dateRange, setDateRange] = useState<'7' | '14' | '30' | '90'>('30')

  const ad = overview.adPerformance
  const adRows = useMemo(
    () => (overview.detailTables?.ad ?? []) as CampaignAdPerformanceRow[],
    [overview.detailTables?.ad]
  )
  const audienceRows = useMemo(
    () => (overview.detailTables?.metaAudienceRows ?? []) as CampaignMetaAudienceRow[],
    [overview.detailTables?.metaAudienceRows]
  )
  const placementRows = useMemo(
    () => (overview.detailTables?.metaPlacementRows ?? []) as CampaignMetaPlacementRow[],
    [overview.detailTables?.metaPlacementRows]
  )
  const hourlyRows = useMemo(
    () => (overview.detailTables?.metaHourlyRows ?? []) as CampaignMetaHourlyRow[],
    [overview.detailTables?.metaHourlyRows]
  )

  const topSpend = ad?.top5BySpend ?? []
  const topCtr = ad?.top5ByCtr ?? []

  // ── KPIs ────────────────────────────────────────────────────────

  const kpis = useMemo(
    () => [
      {
        label: '광고비',
        value: hasNumber(ad?.spend) ? fmtMoney(ad.spend) : '-',
        sub: overview.budget?.plannedBudget
          ? `예산 대비 ${Math.round(overview.budget.burnRate)}%`
          : '예산 정보 없음',
      },
      {
        label: '노출',
        value: hasNumber(ad?.impressions) ? fmtCompact(ad.impressions) : '-',
        sub: '선택 기간 합계',
      },
      {
        label: '도달',
        value: hasNumber(ad?.reach) ? fmtCompact(ad.reach) : '-',
        sub: '선택 기간 합계',
      },
      {
        label: '클릭',
        value: hasNumber(ad?.clicks) ? fmtCompact(ad.clicks) : '-',
        sub: ad?.ctr ? `CTR ${ad.ctr.toFixed(2)}%` : 'CTR -',
      },
      {
        label: 'CPC',
        value: hasNumber(ad?.cpc) ? fmtMoney(ad.cpc) : '-',
        sub: '클릭 단가',
      },
      {
        label: 'ThruPlay',
        value: hasNumber(ad?.thruPlay) ? fmtCompact(ad.thruPlay) : '-',
        sub: '영상 완료 시청',
      },
    ],
    [ad, overview.budget]
  )

  // ── Bar chart data ───────────────────────────────────────────────

  const mainBars = useMemo(() => {
    const source = adRows.slice(0, 8)
    if (source.length === 0) return []
    const values = source.map((row) => {
      if (trendMode === 'spend') return row.spend ?? 0
      if (trendMode === 'clicks') return row.clicks ?? 0
      return row.ctr ?? 0
    })
    const max = Math.max(...values, 1)
    return source.map((row, i) => ({
      label: row.dateStart ? row.dateStart.slice(5) : `${i + 1}`,
      value: values[i],
      height: Math.max(8, Math.round((values[i] / max) * 100)),
    }))
  }, [adRows, trendMode])

  // ── Hourly data ──────────────────────────────────────────────────

  const hourlySeries = useMemo(() => {
    return Array.from({ length: 24 }, (_, hour) => {
      const row = hourlyRows.find((r) => r.hour === hour) ?? {
        hour,
        ctr: 0,
        clicks: 0,
        spend: 0,
        impressions: 0,
      }
      return { hour: String(hour).padStart(2, '0'), ctr: row.ctr, clicks: row.clicks, spend: row.spend }
    })
  }, [hourlyRows])

  const maxHourly = useMemo(() => {
    if (hourlyMetric === 'ctr') return Math.max(...hourlySeries.map((v) => v.ctr), 0.1)
    if (hourlyMetric === 'clicks') return Math.max(...hourlySeries.map((v) => v.clicks), 1)
    return Math.max(...hourlySeries.map((v) => v.spend), 1)
  }, [hourlySeries, hourlyMetric])

  const bestHour = useMemo(
    () => [...hourlySeries].sort((a, b) => b.ctr - a.ctr)[0],
    [hourlySeries]
  )

  // ── Side panel: derive level/breakdown status ────────────────────

  const levelNames = useMemo(
    () => new Set((ad?.byLevel ?? []).map((l) => l.name)),
    [ad?.byLevel]
  )

  const hasBreakdown = audienceRows.length > 0 || placementRows.length > 0 || hourlyRows.length > 0
  const objectNames = topSpend.slice(0, 4)

  // ── Inner tab definitions ────────────────────────────────────────

  const innerTabs: { id: MetaInnerTab; label: string }[] = [
    { id: 'overview', label: '개요' },
    { id: 'audience', label: '오디언스' },
    { id: 'placement', label: '게재위치' },
    { id: 'video', label: '영상' },
    { id: 'fatigue', label: '피로도' },
    { id: 'hourly', label: '시간대' },
  ]

  return (
    <div className={styles.wrapper}>

      {/* ── Two-column layout ──────────────────────────────────── */}
      <div className={styles.metaLayout}>

        {/* ── Left: Main panel ─────────────────────────────────── */}
        <div className={styles.metaPanel}>

          {/* Hero card */}
          <div className={styles.heroCard}>
            <div>
              <span className={styles.eyebrow}>Campaign Scoped Meta Analytics</span>
              <h2 className={styles.heroTitle}>캠페인에 연결된 Meta 광고 성과</h2>
              <p className={styles.heroDesc}>
                저장된 Mapping과 campaignMetaInsightSnapshots를 기반으로 캠페인/광고세트/광고 단위 성과를 분석합니다.
              </p>
            </div>
            <div className={styles.heroActions}>
              {/* Date range segmented control */}
              <div className={styles.seg}>
                {(['7', '14', '30', '90'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDateRange(d)}
                    className={`${styles.segBtn}${dateRange === d ? ` ${styles.segBtnActive}` : ''}`}
                  >
                    {d}일
                  </button>
                ))}
              </div>
              <button type="button" className={styles.btnSecondary} onClick={onOpenMetaSettings}>
                필터
              </button>
              <button type="button" className={styles.btnPrimary} onClick={onOpenMetaSettings}>
                Meta 데이터 새로고침
              </button>
            </div>
          </div>

          {/* KPI grid */}
          <div className={styles.kpiGrid}>
            {kpis.map((kpi, i) => (
              <div
                key={kpi.label}
                className={styles.kpiCard}
                style={{ '--kpi-tint': KPI_TINTS[i] } as React.CSSProperties}
              >
                <span className={styles.kpiLabel}>{kpi.label}</span>
                <span className={styles.kpiValue}>{kpi.value}</span>
                <span className={styles.kpiSub}>{kpi.sub}</span>
              </div>
            ))}
          </div>

          {/* Inner tab bar */}
          <nav className={styles.analyticsTabs}>
            {innerTabs.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setInnerTab(id)}
                className={`${styles.analyticsTab}${innerTab === id ? ` ${styles.analyticsTabActive}` : ''}`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* ── Tab: 개요 ─────────────────────────────────────── */}
          {innerTab === 'overview' && (
            <div className={styles.overviewGrid}>
              {/* Bar chart card */}
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <div>
                    <h3 className={styles.cardTitle}>일별 광고 성과 추이</h3>
                    <span className={styles.cardHint}>광고비는 막대, CTR은 추이로 표시합니다.</span>
                  </div>
                  <div className={styles.seg}>
                    {([
                      ['ctr', 'CTR'],
                      ['clicks', 'Click'],
                      ['spend', 'Spend'],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTrendMode(id)}
                        className={`${styles.segBtn}${trendMode === id ? ` ${styles.segBtnActive}` : ''}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.chartArea}>
                  {mainBars.length > 0 ? (
                    <div
                      className={styles.chartBars}
                      style={{ gridTemplateColumns: `repeat(${mainBars.length}, minmax(0,1fr))` }}
                    >
                      {mainBars.map((bar) => (
                        <div key={bar.label} className={styles.chartBar}>
                          <div
                            className={styles.chartBarFill}
                            style={{ height: `${bar.height}%` }}
                            title={bar.value.toLocaleString()}
                          />
                          <span className={styles.chartBarLabel}>{bar.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, color: '#98a2b3' }}>
                      데이터 수집 후 표시됩니다.
                    </div>
                  )}
                </div>
              </div>

              {/* Ranking card */}
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <div>
                    <h3 className={styles.cardTitle}>캠페인별 지출 랭킹</h3>
                    <span className={styles.cardHint}>선택된 Meta Object 기준</span>
                  </div>
                  <span className={styles.cardHint}>상위 5개</span>
                </div>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th} style={{ width: 30 }}></th>
                      <th className={styles.th}>Campaign</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Spend</th>
                      <th className={`${styles.th} ${styles.thRight}`}>CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSpend.length > 0
                      ? topSpend.map((item, i) => {
                          const ctr = topCtr.find((c) => c.name === item.name)?.ctr ?? 0
                          return (
                            <tr key={`${item.name}-${i}`} className={styles.tableRow}>
                              <td className={styles.td}><span className={styles.rankPill}>{i + 1}</span></td>
                              <td className={`${styles.td} ${styles.tdName}`}>{item.name}</td>
                              <td className={`${styles.td} ${styles.tdRight}`}>{item.spend > 0 ? fmtMoney(item.spend) : '-'}</td>
                              <td className={`${styles.td} ${styles.tdRight}`}>{ctr > 0 ? `${ctr.toFixed(2)}%` : '-'}</td>
                            </tr>
                          )
                        })
                      : (
                        <tr>
                          <td className={styles.td} colSpan={4} style={{ textAlign: 'center', color: '#98a2b3' }}>데이터 없음</td>
                        </tr>
                      )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Tab: 오디언스 ─────────────────────────────────── */}
          {innerTab === 'audience' && (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h3 className={styles.cardTitle}>연령 · 성별 성과</h3>
                  <span className={styles.cardHint}>age/gender breakdown snapshot 기준</span>
                </div>
              </div>
              {audienceRows.length === 0 ? (
                <div className={styles.emptyState}>상세 분석 데이터 수집 후 표시됩니다.</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Age</th>
                      <th className={styles.th}>Gender</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Spend</th>
                      <th className={`${styles.th} ${styles.thRight}`}>CTR</th>
                      <th className={`${styles.th} ${styles.thRight}`}>CPC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...audienceRows].sort((a, b) => b.spend - a.spend).map((row) => (
                      <tr key={`${row.age}-${row.gender}`} className={styles.tableRow}>
                        <td className={styles.td}>{row.age}</td>
                        <td className={styles.td}>{row.gender}</td>
                        <td className={`${styles.td} ${styles.tdRight}`}>{fmtMoney(row.spend)}</td>
                        <td className={`${styles.td} ${styles.tdRight}`}>{fmtRate(row.ctr)}</td>
                        <td className={`${styles.td} ${styles.tdRight}`}>{fmtMoney(row.cpc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Tab: 게재위치 ─────────────────────────────────── */}
          {innerTab === 'placement' && (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h3 className={styles.cardTitle}>게재위치별 성과 비교</h3>
                  <span className={styles.cardHint}>Instagram Reels / Feed / Story 등 placement breakdown 기준</span>
                </div>
              </div>
              {placementRows.length === 0 ? (
                <div className={styles.emptyState}>상세 분석 데이터 수집 후 표시됩니다.</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Platform</th>
                      <th className={styles.th}>Position</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Spend</th>
                      <th className={`${styles.th} ${styles.thRight}`}>CTR</th>
                      <th className={`${styles.th} ${styles.thRight}`}>CPM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...placementRows].sort((a, b) => b.spend - a.spend).map((row) => (
                      <tr key={`${row.publisherPlatform}-${row.platformPosition}`} className={styles.tableRow}>
                        <td className={styles.td}>{row.publisherPlatform}</td>
                        <td className={styles.td}>{row.platformPosition}</td>
                        <td className={`${styles.td} ${styles.tdRight}`}>{fmtMoney(row.spend)}</td>
                        <td className={`${styles.td} ${styles.tdRight}`}>{fmtRate(row.ctr)}</td>
                        <td className={`${styles.td} ${styles.tdRight}`}>{fmtMoney(row.cpm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Tab: 영상 ─────────────────────────────────────── */}
          {innerTab === 'video' && (
            <div className={styles.split}>
              {/* Funnel card */}
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <div>
                    <h3 className={styles.cardTitle}>영상 광고 시청 퍼널</h3>
                    <span className={styles.cardHint}>Play에서 ThruPlay까지 이탈을 봅니다.</span>
                  </div>
                  <span className={`${styles.badge} ${styles.badgeBlue}`}>Video Ads</span>
                </div>
                <div className={styles.funnelGrid}>
                  {([
                    ['노출', ad?.impressions ?? 0, 100],
                    ['Video Play', ad?.videoPlay ?? 0, ad?.impressions ? Math.round(((ad.videoPlay) / ad.impressions) * 100) : 0],
                    ['ThruPlay', ad?.thruPlay ?? 0, ad?.impressions ? Math.round(((ad.thruPlay) / ad.impressions) * 100) : 0],
                    ['Click', ad?.clicks ?? 0, ad?.impressions ? Math.round(((ad.clicks) / ad.impressions) * 100) : 0],
                  ] as [string, number, number][]).map(([label, value, pct]) => (
                    <div key={label} className={styles.funnelRow}>
                      <span>{label}</span>
                      <div className={styles.funnelTrack}>
                        <div className={styles.funnelFill} style={{ width: `${Math.max(Number(pct), 2)}%` }} />
                      </div>
                      <b style={{ textAlign: 'right' }}>{Number(value) > 0 ? fmtCompact(Number(value)) : '-'}</b>
                    </div>
                  ))}
                </div>
              </div>

              {/* Creative insight card */}
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <h3 className={styles.cardTitle}>소재 인사이트</h3>
                  <span className={styles.badge}>CTR 상위</span>
                </div>
                <p className={styles.cardHint} style={{ marginTop: 0, marginBottom: 12 }}>
                  CTR이 높고 CPC가 낮은 소재를 우선 확장 대상으로 추천합니다.
                </p>
                {topCtr.length > 0 ? (
                  <table className={styles.table}>
                    <tbody>
                      {topCtr.slice(0, 5).map((item, i) => (
                        <tr key={item.name} className={styles.tableRow}>
                          <td className={styles.td}><span className={styles.rankPill}>{i + 1}</span></td>
                          <td className={`${styles.td} ${styles.tdName}`}>{item.name}</td>
                          <td className={`${styles.td} ${styles.tdRight}`} style={{ color: '#087a57', fontWeight: 700 }}>{fmtRate(item.ctr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className={styles.emptyState} style={{ minHeight: 120 }}>데이터 수집 후 표시됩니다.</div>
                )}
              </div>
            </div>
          )}

          {/* ── Tab: 피로도 ───────────────────────────────────── */}
          {innerTab === 'fatigue' && (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h3 className={styles.cardTitle}>피로도 분석</h3>
                  <span className={styles.cardHint}>일별 snapshot 기반 CTR/CPC 추세</span>
                </div>
              </div>
              <div className={styles.emptyState}>
                빈도 지표는 frequency snapshot이 수집되면 자동 계산됩니다.
                <br />
                지금은 CTR/CPC 추세를 대체 지표로 사용합니다.
              </div>
            </div>
          )}

          {/* ── Tab: 시간대 ───────────────────────────────────── */}
          {innerTab === 'hourly' && (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h3 className={styles.cardTitle}>시간대별 성과</h3>
                  <span className={styles.cardHint}>hourly breakdown snapshot 기반 막대차트</span>
                </div>
                <div className={styles.seg}>
                  {(['ctr', 'clicks', 'spend'] as const).map((metric) => (
                    <button
                      key={metric}
                      type="button"
                      onClick={() => setHourlyMetric(metric)}
                      className={`${styles.segBtn}${hourlyMetric === metric ? ` ${styles.segBtnActive}` : ''}`}
                    >
                      {metric.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              {hourlyRows.length === 0 ? (
                <div className={styles.emptyState}>
                  상세 분석 데이터 수집 후 표시됩니다.
                  <br />
                  Meta 설정 패널에서 &quot;오디언스/게재위치/시간대 상세 데이터도 수집&quot;을 체크하고 새로고침하세요.
                </div>
              ) : (
                <>
                  <div className={styles.hourlyChart}>
                    {hourlySeries.map((item) => {
                      const value = hourlyMetric === 'ctr' ? item.ctr : hourlyMetric === 'clicks' ? item.clicks : item.spend
                      const height = Math.max(8, Math.round((value / maxHourly) * 100))
                      const peak = value >= maxHourly * 0.9
                      const low = value <= maxHourly * 0.22
                      return (
                        <div key={item.hour} className={styles.hourlyBar}>
                          <div
                            className={`${styles.hourlyBarFill}${peak ? ` ${styles.hourlyBarFillPeak}` : low ? ` ${styles.hourlyBarFillLow}` : ''}`}
                            style={{ height: `${height}%` }}
                            title={`${item.hour}:00 ${hourlyMetric === 'ctr' ? `${value.toFixed(2)}%` : value.toLocaleString()}`}
                          />
                          <span className={styles.hourlyBarLabel}>{item.hour}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className={styles.hourlySummary}>
                    <div className={styles.hourlySummaryCard}>
                      <span className={styles.hourlySummaryLabel}>최고 효율 시간</span>
                      <strong className={styles.hourlySummaryValue}>{bestHour ? `${bestHour.hour}:00 · CTR ${fmtRate(bestHour.ctr)}` : '-'}</strong>
                    </div>
                    <div className={styles.hourlySummaryCard}>
                      <span className={styles.hourlySummaryLabel}>최고 CTR</span>
                      <strong className={styles.hourlySummaryValue}>{bestHour ? fmtRate(bestHour.ctr) : '-'}</strong>
                    </div>
                    <div className={styles.hourlySummaryCard}>
                      <span className={styles.hourlySummaryLabel}>데이터 소스</span>
                      <strong className={styles.hourlySummaryValue}>Snapshot</strong>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Side panel ────────────────────────────────── */}
        <aside className={styles.sidePanel}>

          {/* Mapping status card */}
          <div className={styles.sideCard}>
            <div className={styles.sideCardHead}>
              <div>
                <h3 className={styles.sideCardTitle}>Mapping 상태</h3>
                <span className={styles.sideCardHint}>선택된 Meta Object</span>
              </div>
              <span className={`${styles.badge}${!ad ? ` ${styles.badgeGray}` : ''}`}>
                {ad ? '활성' : '없음'}
              </span>
            </div>
            {objectNames.length > 0 ? (
              objectNames.map((item) => (
                <div key={item.name} className={styles.objectRow}>
                  <span className={styles.objectRowName}>{item.name}</span>
                  <span className={styles.objectRowType}>Campaign</span>
                </div>
              ))
            ) : (
              <p style={{ margin: '4px 0 8px', fontSize: 12, color: '#98a2b3', lineHeight: 1.5 }}>
                아직 선택된 Meta Object가 없습니다.
              </p>
            )}
            <button type="button" className={styles.btnOpenSettings} onClick={onOpenMetaSettings}>
              Object 필터 열기
            </button>
          </div>

          {/* Collection scope card */}
          <div className={styles.sideCard}>
            <div className={styles.sideCardHead}>
              <h3 className={styles.sideCardTitle}>수집 범위</h3>
              <span className={styles.sideCardHint}>snapshot</span>
            </div>
            <table className={styles.table}>
              <tbody>
                {(['campaign', 'adset', 'ad'] as const).map((lv) => {
                  const on = levelNames.has(lv)
                  return (
                    <tr key={lv} className={styles.tableRow}>
                      <td className={styles.td} style={{ textTransform: 'capitalize' }}>{lv === 'adset' ? 'Ad Set' : lv.charAt(0).toUpperCase() + lv.slice(1)}</td>
                      <td className={`${styles.td} ${styles.tdRight}`}>
                        <span className={`${styles.badge}${on ? '' : ` ${styles.badgeGray}`}`}>{on ? 'ON' : 'OFF'}</span>
                      </td>
                    </tr>
                  )
                })}
                <tr className={styles.tableRow}>
                  <td className={styles.td}>Breakdown</td>
                  <td className={`${styles.td} ${styles.tdRight}`}>
                    <span className={`${styles.badge}${hasBreakdown ? ` ${styles.badgeOrange}` : ` ${styles.badgeGray}`}`}>
                      {hasBreakdown ? '3차' : '기본'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Explanation note */}
          <div className={styles.note}>
            이 화면은 광고 RAW 테이블이 아니라 Meta API에서 수집된 snapshot을 캠페인 단위로 재구성합니다. 이후 AI 채팅과 인사이트 도출에도 같은 snapshot 자산을 사용합니다.
          </div>

        </aside>
      </div>
    </div>
  )
}
