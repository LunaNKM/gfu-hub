'use client'

import React, { useState } from 'react'
import type {
  CampaignOverview,
  CampaignOverviewMetric,
  CampaignStatusProgress,
} from '@/types'
import { CampaignPerformanceDetailView } from './CampaignPerformanceDetailView'
import { MetaMappingPanel } from './meta/MetaMappingPanel'

// ── 색상 팔레트 ───────────────────────────────────────────────────

const COLOR: Record<string, string> = {
  blue:   '#3578f6',
  green:  '#12a878',
  orange: '#f08a24',
  gray:   '#8b95a7',
}

const PILL_BG: Record<string, string> = {
  up:   '#e8f8f1',
  warn: '#fff1df',
  flat: '#f0f3f7',
}

const PILL_FG: Record<string, string> = {
  up:   '#067a58',
  warn: '#b75d00',
  flat: '#5e6980',
}

// ── 포맷 헬퍼 ─────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString()
}

// ── KPI 카드 ──────────────────────────────────────────────────────

function KpiCard({ metric }: { metric: CampaignOverviewMetric }) {
  return (
    <div style={{
      padding: 14,
      border: '1px solid #e5e9f0',
      borderRadius: 8,
      background: '#fff',
      minWidth: 0,
    }}>
      <p style={{ margin: 0, color: '#778196', fontSize: 11 }}>{metric.label}</p>
      <p style={{
        margin: '7px 0 0',
        color: '#111827',
        fontSize: 24,
        fontWeight: 800,
        lineHeight: 1.05,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {String(metric.value)}
        {metric.unit && (
          <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 2 }}>{metric.unit}</span>
        )}
      </p>
      {metric.pill && (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 20,
          marginTop: 10,
          padding: '0 7px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          background: PILL_BG[metric.pill.variant] ?? PILL_BG.flat,
          color:      PILL_FG[metric.pill.variant] ?? PILL_FG.flat,
        }}>
          {metric.pill.text}
        </span>
      )}
    </div>
  )
}

// ── 가로 바 행 ────────────────────────────────────────────────────

function HBarRow({ name, count, pct, color }: CampaignStatusProgress) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '88px 1fr 44px',
      gap: 10,
      alignItems: 'center',
      margin: '10px 0',
      fontSize: 12,
    }}>
      <span style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: '#344054',
      }}>{name}</span>
      <div style={{ height: 8, borderRadius: 999, overflow: 'hidden', background: '#eef1f5' }}>
        <div style={{
          height: '100%',
          borderRadius: 'inherit',
          background: COLOR[color] ?? COLOR.blue,
          width: `${Math.min(pct, 100)}%`,
        }} />
      </div>
      <b style={{ textAlign: 'right', color: '#344054', fontWeight: 700 }}>{count}</b>
    </div>
  )
}

// ── 빈 상태 텍스트 ────────────────────────────────────────────────

function EmptyNote({ text }: { text: string }) {
  return <p style={{ margin: '10px 0', color: '#8b95a7', fontSize: 12 }}>{text}</p>
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

interface Props {
  overview: CampaignOverview | null
  campaignId: string
  onReloadWorkspace: () => void
}

export function CampaignOverviewDashboard({ overview, campaignId, onReloadWorkspace }: Props) {
  const [viewMode, setViewMode] = useState<'overview' | 'detail'>('overview')
  const [metaPanelOpen, setMetaPanelOpen] = useState(false)

  if (!overview) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#8b95a7',
        fontSize: 13,
      }}>
        대시보드를 불러오는 중...
      </div>
    )
  }

  if (viewMode === 'detail') {
    return (
      <div className="h-full overflow-y-auto">
        <CampaignPerformanceDetailView
          overview={overview}
          onBack={() => setViewMode('overview')}
        />
      </div>
    )
  }

  const { metrics, summary, contentPerformance, adPerformance, rosterProgress, budget } = overview

  // 데이터 소스
  const bars      = contentPerformance?.barData     ?? []
  const top5      = contentPerformance?.top5ByViews ?? []
  const statuses  = rosterProgress?.statuses        ?? []
  const platforms = rosterProgress?.platforms       ?? []

  const totalViews     = contentPerformance?.totalViews ?? 0
  const uploadCount    = contentPerformance?.uploadCount ?? 0  // 성과 입력 행 수
  const adClicks       = adPerformance?.clicks          ?? 0
  const metaSpend      = adPerformance?.spend           ?? 0
  const plannedBudget  = budget?.plannedBudget          ?? 0
  const burnRate       = budget?.burnRate               ?? 0
  const confirmedCount = summary?.confirmedCount        ?? 0
  const uploadedCount  = summary?.uploadedCount         ?? 0  // 업로드완료 인플루언서 수

  const barCols = Math.min(Math.max(bars.length, 1), 12)

  // mini-table 행 구성
  type ProgressStatus = 'good' | 'progress' | 'watch'

  const statusBadge = (s: ProgressStatus) => {
    if (s === 'good')     return { label: '정상', bg: '#e8f8f1', color: '#087a57' }
    if (s === 'progress') return { label: '진행', bg: '#eaf2ff', color: '#2467d6' }
    return                       { label: '관찰', bg: '#fff1df', color: '#b75d00' }
  }

  const progressRows: { label: string; current: string; target: string; status: ProgressStatus }[] = []

  if (confirmedCount > 0) {
    progressRows.push({
      label:   '콘텐츠 업로드',
      current: `${uploadedCount}건`,
      target:  `${confirmedCount}건`,
      status:  uploadedCount >= confirmedCount ? 'good' : 'progress',
    })
    progressRows.push({
      label:   '성과 수집',
      current: `${uploadCount}건`,
      target:  `${confirmedCount}건`,
      status:  uploadCount >= Math.ceil(confirmedCount * 0.8) ? 'good' : uploadCount > 0 ? 'progress' : 'watch',
    })
  }

  if (metaSpend > 0 && plannedBudget > 0) {
    progressRows.push({
      label:   '광고 예산 소진',
      current: fmtMoney(metaSpend),
      target:  fmtMoney(plannedBudget),
      status:  burnRate > 80 ? 'watch' : 'progress',
    })
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#f7f9fc' }}>
      <div style={{ padding: 18 }}>

        {/* ── Overview 탭 + Meta 설정 버튼 ─────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: 'fit-content',
            padding: 4,
            borderRadius: 10,
            background: '#edf1f7',
          }}>
            {(['Overview', 'Influencer', 'Content', 'Meta'] as const).map((tab) => {
              const active = tab === 'Overview'
              return (
                <span key={tab} style={{
                  height: 28,
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 700,
                  userSelect: 'none',
                  ...(active
                    ? { background: '#fff', color: '#1b2638', boxShadow: '0 1px 3px rgba(16,24,40,.08)' }
                    : { color: '#687387' }),
                }}>
                  {tab}
                </span>
              )
            })}
          </div>

          {/* Meta 설정 버튼 */}
          <button
            type="button"
            onClick={() => setMetaPanelOpen(true)}
            style={{
              height: 30,
              padding: '0 12px',
              border: '1px solid #d5dae5',
              borderRadius: 6,
              background: '#fff',
              color: '#3578f6',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 13 }}>⚙</span>
            Meta 설정
          </button>
        </div>

        {/* ── KPI 그리드 (HTML 시안 breakpoint: 720px/1180px) ── */}
        <div className="grid grid-cols-2 min-[720px]:grid-cols-3 min-[1180px]:grid-cols-6 gap-[10px] mb-[12px]">
          {metrics.map((m) => <KpiCard key={m.id} metric={m} />)}
        </div>

        {/* ── 메인 레이아웃 (1180px 기준 2열) ─────────────── */}
        <div className="grid gap-[12px] grid-cols-1 min-[1180px]:[grid-template-columns:minmax(0,1.35fr)_minmax(340px,.65fr)]">

          {/* ── 왼쪽: 캠페인 성과 요약 ─────────────────── */}
          <section style={{
            border: '1px solid #e5e9f0',
            borderRadius: 8,
            background: '#fff',
            padding: 16,
          }}>
            {/* 패널 헤드 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 12,
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#172033' }}>
                  캠페인 성과 요약
                </h2>
                <span style={{ color: '#8b95a7', fontSize: 11 }}>콘텐츠 + 광고</span>
              </div>
              <button
                type="button"
                aria-label="성과 상세 분석 보기"
                onClick={() => setViewMode('detail')}
                style={{
                  border: 0,
                  background: 'transparent',
                  color: '#3578f6',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '4px 0',
                }}
              >
                자세히 보기
              </button>
            </div>

            {/* chart-area: 1180px+ → 1fr 220px */}
            <div className="grid gap-[16px] items-stretch grid-cols-1 min-[1180px]:[grid-template-columns:minmax(0,1fr)_220px]">

              {/* CSS 막대 차트 */}
              <div style={{
                height: 250,
                display: 'grid',
                gridTemplateColumns: bars.length > 0
                  ? `repeat(${barCols}, minmax(0, 1fr))`
                  : '1fr',
                alignItems: 'end',
                gap: 8,
                padding: '20px 8px 8px',
                borderRadius: 8,
                background: 'linear-gradient(#eef2f7 1px, transparent 1px) 0 20px / 100% 46px, #fbfcfe',
                border: '1px solid #eef1f5',
                minWidth: 0,
                overflow: 'hidden',
              }}>
                {bars.length === 0 ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#8b95a7',
                    fontSize: 12,
                    height: '100%',
                  }}>
                    성과 데이터가 입력되면 자동으로 요약됩니다.
                  </div>
                ) : bars.map((bar, i) => (
                  <div key={i} style={{
                    display: 'grid',
                    gridTemplateRows: '1fr auto',
                    height: '100%',
                    minWidth: 0,
                    gap: 4,
                  }}>
                    <div style={{
                      alignSelf: 'end',
                      width: '100%',
                      height: `${Math.max(bar.pct, 3)}%`,
                      minHeight: 8,
                      borderRadius: '5px 5px 0 0',
                      background: 'linear-gradient(180deg, #3578f6, #8ec5ff)',
                    }} />
                    <span style={{
                      color: '#8c96a8',
                      fontSize: 10,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {bar.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* 요약 박스 3개 */}
              <div style={{ display: 'grid', gap: 9, alignContent: 'start' }}>
                {([
                  { label: '누적 조회수',   value: totalViews  > 0 ? fmtNum(totalViews)  : '-' },
                  { label: '콘텐츠 업로드', value: uploadCount > 0 ? `${uploadCount}건`  : '-' },
                  { label: '광고 클릭',     value: adClicks    > 0 ? fmtNum(adClicks)   : (adPerformance ? '-' : '-') },
                ] as { label: string; value: string }[]).map((item) => (
                  <div key={item.label} style={{
                    padding: 11,
                    border: '1px solid #e5e9f0',
                    borderRadius: 8,
                    background: '#fff',
                  }}>
                    <p style={{ margin: 0, color: '#758096', fontSize: 11 }}>{item.label}</p>
                    <strong style={{ display: 'block', marginTop: 4, fontSize: 18, color: '#172033' }}>
                      {item.value}
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            {/* mini-table */}
            {progressRows.length > 0 && (
              <table style={{
                marginTop: 14,
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 12,
              }}>
                <thead>
                  <tr>
                    {['항목', '현재', '목표', '상태'].map((h) => (
                      <th key={h} style={{
                        padding: '8px 10px',
                        borderBottom: '1px solid #e5e9f0',
                        background: '#f8fafc',
                        color: '#7a8497',
                        fontWeight: 700,
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {progressRows.map((row) => {
                    const badge = statusBadge(row.status)
                    return (
                      <tr key={row.label}>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #edf0f5', whiteSpace: 'nowrap' }}>
                          {row.label}
                        </td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #edf0f5', whiteSpace: 'nowrap' }}>
                          {row.current}
                        </td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #edf0f5', whiteSpace: 'nowrap' }}>
                          {row.target}
                        </td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #edf0f5', whiteSpace: 'nowrap' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            height: 22,
                            padding: '0 8px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            background: badge.bg,
                            color: badge.color,
                          }}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>

          {/* ── 오른쪽 패널 스택 ─────────────────────────── */}
          <aside style={{ display: 'grid', gap: 12, alignContent: 'start' }}>

            {/* 1. 상태별 진행 현황 */}
            <section style={{ border: '1px solid #e5e9f0', borderRadius: 8, background: '#fff', padding: 16 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 12,
              }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#172033' }}>
                  상태별 진행 현황
                </h3>
                <span style={{ color: '#8b95a7', fontSize: 11 }}>확정 인원</span>
              </div>
              {statuses.length === 0
                ? <EmptyNote text="확정 인원 데이터가 입력되면 진행 현황이 표시됩니다." />
                : statuses.map((s) => <HBarRow key={s.name} {...s} />)
              }
            </section>

            {/* 2. 플랫폼별 확정 인원 */}
            <section style={{ border: '1px solid #e5e9f0', borderRadius: 8, background: '#fff', padding: 16 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 12,
              }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#172033' }}>
                  플랫폼별 확정 인원
                </h3>
                <span style={{ color: '#8b95a7', fontSize: 11 }}>비중</span>
              </div>
              {platforms.length === 0
                ? <EmptyNote text="확정 인원 데이터가 입력되면 플랫폼 분포가 표시됩니다." />
                : platforms.map((p) => <HBarRow key={p.name} {...p} />)
              }
            </section>

            {/* 3. 조회수 랭킹 */}
            <section style={{ border: '1px solid #e5e9f0', borderRadius: 8, background: '#fff', padding: 16 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 12,
              }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#172033' }}>
                  조회수 랭킹
                </h3>
                <span style={{ color: '#8b95a7', fontSize: 11 }}>Top 5</span>
              </div>
              {top5.length === 0 ? (
                <EmptyNote text="성과 데이터가 입력되면 조회수 랭킹이 표시됩니다." />
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {top5.map((item, i) => (
                    <div key={i} style={{
                      display: 'grid',
                      gridTemplateColumns: '22px 1fr 66px',
                      gap: 8,
                      alignItems: 'center',
                      color: '#475467',
                      fontSize: 12,
                    }}>
                      <span style={{
                        width: 20,
                        height: 20,
                        display: 'inline-grid',
                        placeItems: 'center',
                        borderRadius: 6,
                        background: '#f0f3f7',
                        color: '#667085',
                        fontSize: 11,
                        fontWeight: 800,
                      }}>
                        {i + 1}
                      </span>
                      <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                      }}>
                        {item.name}
                      </span>
                      <strong style={{ textAlign: 'right', fontWeight: 700 }}>
                        {fmtNum(item.views)}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </aside>
        </div>
      </div>

      {/* Meta 설정 패널 */}
      <MetaMappingPanel
        campaignId={campaignId}
        isOpen={metaPanelOpen}
        onClose={() => setMetaPanelOpen(false)}
        onRefreshSuccess={() => {
          setMetaPanelOpen(false)
          onReloadWorkspace()
        }}
      />
    </div>
  )
}
