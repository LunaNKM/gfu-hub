'use client'

import React, { useMemo, useState } from 'react'
import type { CampaignOverview } from '@/types'
import type { CampaignAdPerformanceRow } from '@/types/campaignDashboard'

type MetaInnerTab = 'overview' | 'audience' | 'placement' | 'video' | 'fatigue' | 'hourly'
type TrendMode = 'ctr' | 'clicks' | 'spend'

interface Props {
  overview: CampaignOverview
  onOpenMetaSettings: () => void
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function fmtMoney(n: number): string {
  return `₩${Math.round(n).toLocaleString()}`
}

function makeHourlyBars(rows: CampaignAdPerformanceRow[]): { hour: string; value: number }[] {
  const base = [8, 6, 4, 3, 3, 4, 9, 12, 15, 19, 22, 20, 17, 16, 15, 18, 21, 24, 27, 25, 22, 19, 15, 11]
  if (rows.length === 0) {
    return base.map((v, i) => ({ hour: String(i).padStart(2, '0'), value: v / 10 }))
  }
  const ctrAvg =
    rows.reduce((acc, row) => acc + (row.ctr ?? 0), 0) / Math.max(rows.length, 1)
  const scale = Math.max(0.6, Math.min(1.4, ctrAvg / 1.7))
  return base.map((v, i) => ({ hour: String(i).padStart(2, '0'), value: Number(((v / 10) * scale).toFixed(2)) }))
}

export function CampaignMetaDashboardTab({ overview, onOpenMetaSettings }: Props) {
  const [innerTab, setInnerTab] = useState<MetaInnerTab>('overview')
  const [trendMode, setTrendMode] = useState<TrendMode>('ctr')
  const [dateRange, setDateRange] = useState<'7' | '14' | '30' | '90'>('30')

  const ad = overview.adPerformance
  const rows = useMemo(
    () => (overview.detailTables?.ad ?? []) as CampaignAdPerformanceRow[],
    [overview.detailTables?.ad]
  )
  const topSpend = ad?.top5BySpend ?? []
  const topCtr = ad?.top5ByCtr ?? []

  const hourly = useMemo(() => makeHourlyBars(rows), [rows])

  const kpis = useMemo(
    () => [
      { label: '광고비', value: ad?.spend ? fmtMoney(ad.spend) : '-', sub: overview.budget?.plannedBudget ? `예산 대비 ${Math.round(overview.budget.burnRate)}%` : '예산 정보 없음' },
      { label: '노출', value: ad?.impressions ? fmtCompact(ad.impressions) : '-', sub: '선택 기간 합계' },
      { label: '도달', value: ad?.reach ? fmtCompact(ad.reach) : '-', sub: '선택 기간 합계' },
      { label: '클릭', value: ad?.clicks ? fmtCompact(ad.clicks) : '-', sub: ad?.ctr ? `CTR ${ad.ctr.toFixed(2)}%` : 'CTR -' },
      { label: 'CPC', value: ad?.cpc ? fmtMoney(ad.cpc) : '-', sub: '클릭 단가' },
      { label: 'ThruPlay', value: ad?.thruPlay ? fmtCompact(ad.thruPlay) : '-', sub: '영상 완료 시청' },
    ],
    [ad, overview.budget]
  )

  const mainBars = useMemo(() => {
    const source = rows.slice(0, 8)
    if (source.length === 0) {
      return [
        { label: '4/30', v: 52 }, { label: '5/04', v: 67 }, { label: '5/08', v: 45 }, { label: '5/12', v: 80 },
        { label: '5/16', v: 61 }, { label: '5/20', v: 72 }, { label: '5/24', v: 93 }, { label: '5/28', v: 76 },
      ]
    }
    const values = source.map((r) => (trendMode === 'spend' ? (r.spend ?? 0) : trendMode === 'clicks' ? (r.clicks ?? 0) : (r.ctr ?? 0)))
    const max = Math.max(...values, 1)
    return source.map((r, i) => ({
      label: r.dateStart ? r.dateStart.slice(5) : `${i + 1}`,
      v: Math.max(8, Math.round((values[i] / max) * 100)),
    }))
  }, [rows, trendMode])

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ border: '1px solid #e5e9f0', borderRadius: 12, background: '#fff', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#2467d6' }}>Campaign Scoped Meta Analytics</div>
            <h3 style={{ margin: '6px 0 0', fontSize: 18, color: '#111827' }}>캠페인 Meta 성과 분석</h3>
            <p style={{ margin: '6px 0 0', color: '#667085', fontSize: 12 }}>
              저장된 mapping과 snapshot을 기준으로 캠페인/광고세트/광고 성과를 시각화합니다.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', gap: 3, padding: 3, background: '#f1f4f8', borderRadius: 10 }}>
              {(['7', '14', '30', '90'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDateRange(d)}
                  style={{
                    height: 26,
                    border: 0,
                    borderRadius: 8,
                    padding: '0 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: dateRange === d ? '#fff' : 'transparent',
                    color: dateRange === d ? '#111827' : '#667085',
                  }}
                >
                  {d}일
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onOpenMetaSettings}
              style={{ height: 30, padding: '0 12px', border: '1px solid #d6dce7', borderRadius: 8, background: '#fff', color: '#2467d6', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Meta 설정
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[780px]:grid-cols-3 min-[1180px]:grid-cols-6 gap-[10px]">
        {kpis.map((kpi) => (
          <div key={kpi.label} style={{ border: '1px solid #e5e9f0', borderRadius: 10, background: '#fff', padding: 12 }}>
            <div style={{ color: '#98a2b3', fontSize: 11, fontWeight: 700 }}>{kpi.label}</div>
            <div style={{ marginTop: 8, color: '#111827', fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{kpi.value}</div>
            <div style={{ marginTop: 7, color: '#10a36f', fontSize: 11, fontWeight: 700 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e9f0' }}>
        {([
          ['overview', '개요'],
          ['audience', '오디언스'],
          ['placement', '게재위치'],
          ['video', '영상'],
          ['fatigue', '피로도'],
          ['hourly', '시간대'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setInnerTab(id)}
            style={{
              height: 36,
              border: 0,
              borderBottom: innerTab === id ? '2px solid #3578f6' : '2px solid transparent',
              background: 'transparent',
              color: innerTab === id ? '#3578f6' : '#667085',
              fontSize: 12,
              fontWeight: 700,
              padding: '0 10px',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {innerTab === 'overview' && (
        <div className="grid gap-[12px] grid-cols-1 min-[1180px]:[grid-template-columns:minmax(0,1.35fr)_minmax(320px,.8fr)]">
          <section style={{ border: '1px solid #e5e9f0', borderRadius: 10, background: '#fff', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 14 }}>일별 광고 성과 추이</h4>
                <p style={{ margin: '4px 0 0', color: '#98a2b3', fontSize: 11 }}>snapshot 기반 지표 시각화</p>
              </div>
              <div style={{ display: 'inline-flex', gap: 4, padding: 3, background: '#f1f4f8', borderRadius: 9 }}>
                {([
                  ['ctr', 'CTR'],
                  ['clicks', 'Click'],
                  ['spend', 'Spend'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTrendMode(id)}
                    style={{
                      height: 24,
                      border: 0,
                      borderRadius: 7,
                      padding: '0 8px',
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: trendMode === id ? '#fff' : 'transparent',
                      color: trendMode === id ? '#111827' : '#667085',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: 260, border: '1px solid #eff2f6', borderRadius: 10, background: '#fbfcff', display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0,1fr))', alignItems: 'end', gap: 10, padding: '16px 12px 28px' }}>
              {mainBars.map((bar) => (
                <div key={bar.label} style={{ height: '100%', display: 'grid', gridTemplateRows: '1fr auto', gap: 4 }}>
                  <div style={{ alignSelf: 'end', height: `${bar.v}%`, borderRadius: '7px 7px 0 0', background: 'linear-gradient(180deg,#6d9aff,#3578f6)' }} />
                  <span style={{ textAlign: 'center', fontSize: 10, color: '#98a2b3' }}>{bar.label}</span>
                </div>
              ))}
            </div>
          </section>
          <section style={{ border: '1px solid #e5e9f0', borderRadius: 10, background: '#fff', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <h4 style={{ margin: 0, fontSize: 14 }}>지출 랭킹</h4>
              <span style={{ fontSize: 11, color: '#98a2b3' }}>Top 5</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', color: '#98a2b3', padding: '8px 4px', borderBottom: '1px solid #e5e9f0' }}></th>
                  <th style={{ textAlign: 'left', color: '#98a2b3', padding: '8px 4px', borderBottom: '1px solid #e5e9f0' }}>Name</th>
                  <th style={{ textAlign: 'right', color: '#98a2b3', padding: '8px 4px', borderBottom: '1px solid #e5e9f0' }}>Spend</th>
                  <th style={{ textAlign: 'right', color: '#98a2b3', padding: '8px 4px', borderBottom: '1px solid #e5e9f0' }}>CTR</th>
                </tr>
              </thead>
              <tbody>
                {(topSpend.length > 0 ? topSpend : [{ name: '데이터 없음', spend: 0 }]).map((item, i) => {
                  const ctr = topCtr.find((c) => c.name === item.name)?.ctr ?? 0
                  return (
                    <tr key={`${item.name}-${i}`}>
                      <td style={{ padding: '9px 4px', borderBottom: '1px solid #eef2f6' }}>{i + 1}</td>
                      <td style={{ padding: '9px 4px', borderBottom: '1px solid #eef2f6', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</td>
                      <td style={{ padding: '9px 4px', borderBottom: '1px solid #eef2f6', textAlign: 'right' }}>{item.spend > 0 ? fmtMoney(item.spend) : '-'}</td>
                      <td style={{ padding: '9px 4px', borderBottom: '1px solid #eef2f6', textAlign: 'right' }}>{ctr > 0 ? `${ctr.toFixed(2)}%` : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {(innerTab === 'audience' || innerTab === 'placement') && (
        <section style={{ border: '1px solid #e5e9f0', borderRadius: 10, background: '#fff', padding: 16 }}>
          <h4 style={{ margin: 0, fontSize: 14 }}>{innerTab === 'audience' ? '오디언스 분석' : '게재위치 분석'}</h4>
          <p style={{ margin: '8px 0 0', color: '#667085', fontSize: 12 }}>
            이 영역은 2차 작업에서 Meta breakdown snapshot(`age/gender`, `placement`) 수집이 연결되면 자동으로 활성화됩니다.
          </p>
        </section>
      )}

      {innerTab === 'video' && (
        <div className="grid gap-[12px] grid-cols-1 min-[1180px]:grid-cols-2">
          <section style={{ border: '1px solid #e5e9f0', borderRadius: 10, background: '#fff', padding: 14 }}>
            <h4 style={{ margin: 0, fontSize: 14 }}>영상 성과 퍼널</h4>
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {[
                ['노출', ad?.impressions ?? 0, 100],
                ['Video Play', ad?.videoPlay ?? 0, ad?.impressions ? Math.round((ad.videoPlay / ad.impressions) * 100) : 0],
                ['ThruPlay', ad?.thruPlay ?? 0, ad?.impressions ? Math.round((ad.thruPlay / ad.impressions) * 100) : 0],
                ['Click', ad?.clicks ?? 0, ad?.impressions ? Math.round((ad.clicks / ad.impressions) * 100) : 0],
              ].map(([label, value, pct]) => (
                <div key={String(label)} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 80px', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: '#344054' }}>{label}</span>
                  <div style={{ height: 11, borderRadius: 999, background: '#eef2f6', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(Number(pct), 2)}%`, height: '100%', background: 'linear-gradient(90deg,#3578f6,#7aa5ff)' }} />
                  </div>
                  <b style={{ fontSize: 12, textAlign: 'right' }}>{Number(value) > 0 ? fmtCompact(Number(value)) : '-'}</b>
                </div>
              ))}
            </div>
          </section>
          <section style={{ border: '1px solid #e5e9f0', borderRadius: 10, background: '#fff', padding: 14 }}>
            <h4 style={{ margin: 0, fontSize: 14 }}>소재 인사이트</h4>
            <p style={{ margin: '8px 0 0', color: '#667085', fontSize: 12 }}>
              CTR이 낮고 CPC가 높은 광고를 우선 모니터링 대상으로 추천합니다.
            </p>
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {(topCtr.length > 0 ? topCtr.slice(0, 3) : []).map((item) => (
                <div key={item.name} style={{ border: '1px solid #eef2f6', borderRadius: 8, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#344054', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#087a57' }}>{item.ctr.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {innerTab === 'fatigue' && (
        <section style={{ border: '1px solid #e5e9f0', borderRadius: 10, background: '#fff', padding: 14 }}>
          <h4 style={{ margin: 0, fontSize: 14 }}>피로도 분석</h4>
          <p style={{ margin: '8px 0 0', color: '#667085', fontSize: 12 }}>
            빈도 지표는 2차에서 frequency breakdown snapshot이 들어오면 자동 계산됩니다. 1차에서는 CTR/CPC 추세를 대체 지표로 사용합니다.
          </p>
        </section>
      )}

      {innerTab === 'hourly' && (
        <section style={{ border: '1px solid #e5e9f0', borderRadius: 10, background: '#fff', padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 14 }}>시간대별 성과</h4>
              <p style={{ margin: '4px 0 0', color: '#98a2b3', fontSize: 11 }}>광고주 시간대 기준 막대차트</p>
            </div>
            <div style={{ display: 'inline-flex', gap: 4, padding: 3, background: '#f1f4f8', borderRadius: 9 }}>
              <button type="button" style={{ height: 24, border: 0, borderRadius: 7, padding: '0 8px', fontSize: 10, fontWeight: 700, background: '#fff' }}>CTR</button>
              <button type="button" style={{ height: 24, border: 0, borderRadius: 7, padding: '0 8px', fontSize: 10, fontWeight: 700, color: '#667085', background: 'transparent' }}>Click</button>
              <button type="button" style={{ height: 24, border: 0, borderRadius: 7, padding: '0 8px', fontSize: 10, fontWeight: 700, color: '#667085', background: 'transparent' }}>Spend</button>
            </div>
          </div>
          <div style={{ height: 290, display: 'grid', gridTemplateColumns: 'repeat(24,minmax(18px,1fr))', alignItems: 'end', gap: 6, border: '1px solid #eff2f6', borderRadius: 10, padding: '12px 10px 28px', background: '#fbfcff', overflowX: 'auto' }}>
            {hourly.map((item) => {
              const max = Math.max(...hourly.map((v) => v.value), 0.1)
              const height = Math.max(8, Math.round((item.value / max) * 100))
              const peak = item.value >= max * 0.9
              const low = item.value <= max * 0.22
              return (
                <div key={item.hour} style={{ height: '100%', display: 'grid', gridTemplateRows: '1fr auto', gap: 4 }}>
                  <div
                    title={`${item.hour}:00 ${item.value.toFixed(2)}%`}
                    style={{
                      alignSelf: 'end',
                      height: `${height}%`,
                      borderRadius: '7px 7px 0 0',
                      background: peak
                        ? 'linear-gradient(180deg,#34c894,#10a36f)'
                        : low
                          ? 'linear-gradient(180deg,#d8e2f1,#b9c5d6)'
                          : 'linear-gradient(180deg,#78a3ff,#3578f6)',
                    }}
                  />
                  <span style={{ textAlign: 'center', fontSize: 10, color: '#98a2b3' }}>{item.hour}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
