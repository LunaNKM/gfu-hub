'use client'

import React, { useState } from 'react'
import type { CampaignOverview } from '@/types'
import type {
  CampaignDetailTabSummary,
  CampaignDetailTables,
} from '@/types/campaignDashboard'

// ── 타입 ──────────────────────────────────────────────────────────

type DetailTabId = 'post' | 'ad' | 'confirmed' | 'candidates' | 'budget'

const TAB_LABELS: Record<DetailTabId, string> = {
  post:       '게시물 성과',
  ad:         '광고 성과',
  confirmed:  '확정 인원',
  candidates: '후보자',
  budget:     '예산',
}

// ── 포맷 헬퍼 ─────────────────────────────────────────────────────

function fmtN(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString()
}

function nn(n: number | null, fmt: (v: number) => string = fmtN): string {
  return n === null || n === undefined ? '-' : fmt(n)
}

// ── 색상 ──────────────────────────────────────────────────────────

const BAR_COLOR: Record<string, string> = {
  blue:   '#3578f6',
  green:  '#12a878',
  orange: '#f08a24',
  gray:   '#8b95a7',
}

// ── 시트 공통 스타일 ──────────────────────────────────────────────

const cellStyle: React.CSSProperties = {
  padding: '10px',
  borderRight: '1px solid #eef1f5',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const headStyle: React.CSSProperties = {
  ...cellStyle,
  background: '#f3f5f8',
  borderBottom: '1px solid #d7dde7',
  color: '#5e687a',
  fontSize: 11,
  fontWeight: 800,
}

function SheetHeader({ cols, grid }: { cols: string[]; grid: string }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: grid,
      position: 'sticky',
      top: 0,
      zIndex: 2,
    }}>
      {cols.map((h) => <div key={h} style={headStyle}>{h}</div>)}
    </div>
  )
}

function SheetRow({ cells, grid }: { cells: string[]; grid: string }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: grid,
      borderBottom: '1px solid #eef1f5',
      fontSize: 12,
      background: '#fff',
    }}>
      {cells.map((c, i) => <div key={i} style={cellStyle}>{c}</div>)}
    </div>
  )
}

// ── 측면 패널 요약 바 ─────────────────────────────────────────────

function SideSummaryBars({ items }: { items: CampaignDetailTabSummary[] }) {
  if (items.length === 0) {
    return <p style={{ margin: '10px 0', color: '#8b95a7', fontSize: 12 }}>데이터가 없습니다.</p>
  }
  return (
    <>
      {items.map((item) => (
        <div key={item.label} style={{
          display: 'grid',
          gridTemplateColumns: '78px 1fr 48px',
          gap: 10,
          alignItems: 'center',
          margin: '10px 0',
          fontSize: 12,
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#344054' }}>
            {item.label}
          </span>
          <div style={{ height: 8, borderRadius: 999, overflow: 'hidden', background: '#eef1f5' }}>
            <div style={{
              height: '100%',
              borderRadius: 'inherit',
              background: BAR_COLOR[item.color] ?? BAR_COLOR.blue,
              width: `${Math.min(item.pct, 100)}%`,
            }} />
          </div>
          <b style={{ textAlign: 'right', color: '#344054', fontWeight: 700, fontSize: 11 }}>{item.value}</b>
        </div>
      ))}
    </>
  )
}

// ── 탭별 시트 렌더러 ──────────────────────────────────────────────

function PostSheet({ tables }: { tables: CampaignDetailTables | undefined }) {
  const rows = tables?.post ?? []
  const grid = '46px 1.15fr .75fr .75fr .8fr .7fr .7fr .7fr .7fr .7fr'
  const headers = ['#', '계정명', '플랫폼', '형식', '조회수', '좋아요', '저장', '댓글', '공유', 'ER']

  return (
    <div style={{ minWidth: 960 }}>
      <SheetHeader cols={headers} grid={grid} />
      {rows.length === 0 ? (
        <p style={{ padding: '40px 20px', color: '#8b95a7', fontSize: 12, textAlign: 'center', margin: 0 }}>
          인플루언서 성과 데이터가 없습니다.
        </p>
      ) : rows.map((row, i) => (
        <SheetRow key={i} grid={grid} cells={[
          String(i + 1),
          row.name,
          row.platform,
          row.format || '-',
          nn(row.views),
          nn(row.likes),
          nn(row.saves),
          nn(row.comments),
          nn(row.shares),
          row.er !== null ? `${row.er.toFixed(1)}%` : '-',
        ]} />
      ))}
    </div>
  )
}

function AdSheet({ tables }: { tables: CampaignDetailTables | undefined }) {
  const rows = tables?.ad ?? []
  const grid = '46px .75fr 1.3fr .85fr .85fr .85fr .8fr .7fr .7fr .7fr'
  const headers = ['#', 'Level', 'Name', 'Spend', 'Impressions', 'Reach', 'Clicks', 'CTR', 'CPC', 'CPM']

  return (
    <div style={{ minWidth: 1080 }}>
      <SheetHeader cols={headers} grid={grid} />
      {rows.length === 0 ? (
        <p style={{ padding: '40px 20px', color: '#8b95a7', fontSize: 12, textAlign: 'center', margin: 0 }}>
          Meta Analytics 데이터가 없습니다.
        </p>
      ) : rows.map((row, i) => (
        <SheetRow key={i} grid={grid} cells={[
          String(i + 1),
          row.level,
          row.name,
          nn(row.spend, fmtMoney),
          nn(row.impressions),
          nn(row.reach),
          nn(row.clicks),
          row.ctr !== null ? `${row.ctr.toFixed(2)}%` : '-',
          nn(row.cpc, fmtMoney),
          nn(row.cpm, fmtMoney),
        ]} />
      ))}
    </div>
  )
}

const STATUS_BG: Record<string, string> = {
  '업로드완료': '#e8f8f1', '검수중': '#eaf2ff', '초안대기': '#fff1df',
  '계약완료': '#eaf2ff', '계약전': '#f0f2f5',
}
const STATUS_FG: Record<string, string> = {
  '업로드완료': '#087a57', '검수중': '#2467d6', '초안대기': '#b75d00',
  '계약완료': '#2467d6', '계약전': '#5e687a',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      height: 20, padding: '0 7px', borderRadius: 999,
      fontSize: 10, fontWeight: 700,
      background: STATUS_BG[status] ?? '#f0f2f5',
      color: STATUS_FG[status] ?? '#5e687a',
    }}>
      {status || '-'}
    </span>
  )
}

function ConfirmedSheet({ tables }: { tables: CampaignDetailTables | undefined }) {
  const rows = tables?.confirmed ?? []
  const grid = '46px 1.15fr .75fr .8fr .75fr 1fr .8fr'
  const headers = ['#', '계정명', '플랫폼', '카테고리', '팔로워', '현재 상태', '비고']

  return (
    <div style={{ minWidth: 840 }}>
      <SheetHeader cols={headers} grid={grid} />
      {rows.length === 0 ? (
        <p style={{ padding: '40px 20px', color: '#8b95a7', fontSize: 12, textAlign: 'center', margin: 0 }}>
          확정 인원 데이터가 없습니다.
        </p>
      ) : rows.map((row, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: grid,
          borderBottom: '1px solid #eef1f5', fontSize: 12, background: '#fff',
        }}>
          <div style={cellStyle}>{i + 1}</div>
          <div style={cellStyle}>{row.name}</div>
          <div style={cellStyle}>{row.platform}</div>
          <div style={cellStyle}>{row.category}</div>
          <div style={cellStyle}>{nn(row.followers)}</div>
          <div style={{ ...cellStyle }}><StatusBadge status={row.status} /></div>
          <div style={cellStyle}>{row.note || '-'}</div>
        </div>
      ))}
    </div>
  )
}

function CandidatesSheet({ tables }: { tables: CampaignDetailTables | undefined }) {
  const rows = tables?.candidates ?? []
  const grid = '46px 1.15fr .75fr .8fr .75fr .8fr .8fr'
  const headers = ['#', '계정명', '플랫폼', '카테고리', '팔로워', '확정 여부', '비고']

  return (
    <div style={{ minWidth: 840 }}>
      <SheetHeader cols={headers} grid={grid} />
      {rows.length === 0 ? (
        <p style={{ padding: '40px 20px', color: '#8b95a7', fontSize: 12, textAlign: 'center', margin: 0 }}>
          후보자 데이터가 없습니다.
        </p>
      ) : rows.map((row, i) => {
        const isConfirmed = row.confirmed === '확정'
        return (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: grid,
            borderBottom: '1px solid #eef1f5', fontSize: 12, background: '#fff',
          }}>
            <div style={cellStyle}>{i + 1}</div>
            <div style={cellStyle}>{row.name}</div>
            <div style={cellStyle}>{row.platform}</div>
            <div style={cellStyle}>{row.category}</div>
            <div style={cellStyle}>{nn(row.followers)}</div>
            <div style={cellStyle}>
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                height: 20, padding: '0 7px', borderRadius: 999,
                fontSize: 10, fontWeight: 700,
                background: isConfirmed ? '#e8f8f1' : '#f0f2f5',
                color: isConfirmed ? '#087a57' : '#5e687a',
              }}>
                {row.confirmed}
              </span>
            </div>
            <div style={cellStyle}>{row.note || '-'}</div>
          </div>
        )
      })}
    </div>
  )
}

function BudgetSheet({ tables }: { tables: CampaignDetailTables | undefined }) {
  const rows = tables?.budget ?? []
  const grid = '46px .75fr 1.3fr .85fr .85fr .8fr .7fr .7fr .7fr .8fr'
  const headers = ['#', '항목', '채널', '목적', '예산', '예상 CPM', '예상 CPC', '예상 노출', '예상 클릭', '비고']

  return (
    <div style={{ minWidth: 1080 }}>
      <SheetHeader cols={headers} grid={grid} />
      {rows.length === 0 ? (
        <p style={{ padding: '40px 20px', color: '#8b95a7', fontSize: 12, textAlign: 'center', margin: 0 }}>
          광고 예산안 데이터가 없습니다.
        </p>
      ) : rows.map((row, i) => (
        <SheetRow key={i} grid={grid} cells={[
          String(i + 1),
          row.item,
          row.channel,
          row.purpose,
          nn(row.budget, fmtMoney),
          nn(row.estCpm, fmtMoney),
          nn(row.estCpc, fmtMoney),
          nn(row.estImpr),
          nn(row.estClick),
          row.note || '-',
        ]} />
      ))}
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

interface Props {
  overview: CampaignOverview
  onBack: () => void
}

export function CampaignPerformanceDetailView({ overview, onBack }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTabId>('post')

  const { summary, dataQuality, detailTables } = overview

  // ── 메트릭 스트립 데이터 (10개) ───────────────────────────────
  const strip = [
    { label: '후보자',      value: detailTables ? String(detailTables.candidates.length) : '-' },
    { label: '확정',        value: summary?.confirmedCount ? `${summary.confirmedCount}명` : '-' },
    { label: '성과 수집률', value: dataQuality ? `${Math.round(dataQuality.performanceCollectionRate)}%` : '-' },
    { label: '업로드',      value: summary?.uploadRate != null ? `${summary.uploadRate}%` : '-' },
    { label: '평균 조회',   value: summary?.avgViews ? fmtN(summary.avgViews) : '-' },
    { label: '평균 ER',     value: summary?.avgEr ? `${summary.avgEr}%` : '-' },
    { label: 'Spend',       value: summary?.metaSpend ? fmtN(summary.metaSpend) : '-' },
    { label: 'CTR',         value: summary?.metaCtr ? `${summary.metaCtr.toFixed(2)}%` : '-' },
    { label: 'CPC',         value: summary?.metaCpc ? fmtMoney(summary.metaCpc) : '-' },
    { label: 'CPM',         value: summary?.metaCpm ? fmtMoney(summary.metaCpm) : '-' },
  ]

  // ── 탭별 사이드 패널 데이터 ───────────────────────────────────
  const tabSummary =
    activeTab === 'post'       ? detailTables?.postSummary
    : activeTab === 'ad'       ? detailTables?.adSummary
    : activeTab === 'confirmed' ? detailTables?.confirmedSummary
    : activeTab === 'candidates' ? detailTables?.candidatesSummary
    : detailTables?.budgetSummary

  const tabNote =
    activeTab === 'post'       ? detailTables?.postNote
    : activeTab === 'ad'       ? detailTables?.adNote
    : activeTab === 'confirmed' ? detailTables?.confirmedNote
    : activeTab === 'candidates' ? detailTables?.candidatesNote
    : detailTables?.budgetNote

  const warnings = dataQuality?.warnings ?? []

  return (
    <div style={{ background: '#fff', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── 툴바 ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        minHeight: 54,
        padding: '8px 14px',
        borderBottom: '1px solid #d7dde7',
        background: '#fbfcfe',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#172033' }}>성과 상세 분석</h2>
          <p style={{ margin: '3px 0 0', color: '#6c7587', fontSize: 12 }}>
            일별 캠페인 성과 추이에서 드릴다운된 운영 그리드
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 세그먼트 탭 */}
          <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 9, background: '#edf1f7' }}>
            {(Object.keys(TAB_LABELS) as DetailTabId[]).map((tab) => (
              <button
                key={tab}
                type="button"
                aria-pressed={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  height: 28, border: 0, borderRadius: 6,
                  background: activeTab === tab ? '#fff' : 'transparent',
                  color:      activeTab === tab ? '#1b2638' : '#687387',
                  padding: '0 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  boxShadow: activeTab === tab ? '0 1px 3px rgba(16,24,40,.08)' : 'none',
                }}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onBack}
            style={{
              height: 34, border: '1px solid #d7dde7', borderRadius: 8,
              background: '#fff', color: '#344054',
              padding: '0 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            대시보드로 돌아가기
          </button>
        </div>
      </div>

      {/* ── 메트릭 스트립 ────────────────────────────────────── */}
      <div className="grid grid-cols-2 min-[720px]:grid-cols-5 min-[1180px]:grid-cols-10"
           style={{ borderBottom: '1px solid #d7dde7' }}>
        {strip.map((item, i) => (
          <div key={i} style={{
            minWidth: 0,
            padding: '12px 10px',
            borderRight: i < strip.length - 1 ? '1px solid #e4e8ef' : 0,
          }}>
            <p style={{ margin: 0, color: '#7a8497', fontSize: 10 }}>{item.label}</p>
            <strong style={{
              display: 'block', marginTop: 5,
              fontSize: 17, lineHeight: 1.1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {item.value}
            </strong>
          </div>
        ))}
      </div>

      {/* ── 상세 바디 ────────────────────────────────────────── */}
      <div className="grid min-[1180px]:[grid-template-columns:minmax(0,1fr)_340px]"
           style={{ flex: 1, minHeight: 700 }}>

        {/* 시트 영역 */}
        <div
          className="border-b border-[#d7dde7] min-[1180px]:border-b-0 min-[1180px]:border-r min-[1180px]:border-[#d7dde7]"
          style={{ minWidth: 0, overflow: 'auto' }}
        >
          {activeTab === 'post'       && <PostSheet       tables={detailTables} />}
          {activeTab === 'ad'         && <AdSheet         tables={detailTables} />}
          {activeTab === 'confirmed'  && <ConfirmedSheet  tables={detailTables} />}
          {activeTab === 'candidates' && <CandidatesSheet tables={detailTables} />}
          {activeTab === 'budget'     && <BudgetSheet     tables={detailTables} />}
        </div>

        {/* 사이드 패널 */}
        <aside style={{
          padding: 14,
          display: 'grid',
          gap: 12,
          alignContent: 'start',
          background: '#fbfcfe',
        }}>

          {/* 탭 요약 카드 */}
          <section style={{ padding: 12, border: '1px solid #e5e9f0', borderRadius: 8, background: '#fff' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8, marginBottom: 4,
            }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#172033' }}>선택 탭 요약</h3>
              <span style={{ color: '#8b95a7', fontSize: 11 }}>{TAB_LABELS[activeTab]}</span>
            </div>
            <SideSummaryBars items={tabSummary ?? []} />
            {tabNote && (
              <p style={{ margin: '10px 0 0', color: '#778196', fontSize: 11, lineHeight: 1.55 }}>
                {tabNote}
              </p>
            )}
          </section>

          {/* Meta Spend 스파크 */}
          <section style={{ padding: 12, border: '1px solid #e5e9f0', borderRadius: 8, background: '#fff' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8, marginBottom: 8,
            }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#172033' }}>Meta Spend</h3>
              <span style={{ color: '#8b95a7', fontSize: 11 }}>분포</span>
            </div>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#111827', lineHeight: 1.05 }}>
              {summary?.metaSpend ? fmtN(summary.metaSpend) : '-'}
            </p>
            {(detailTables?.metaSpendSpark?.length ?? 0) > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 58, marginTop: 12 }}>
                {detailTables!.metaSpendSpark.map((pct, i) => (
                  <div key={i} style={{
                    flex: 1,
                    height: `${pct}%`,
                    borderRadius: '3px 3px 0 0',
                    background: '#3578f6',
                    opacity: 0.82,
                  }} />
                ))}
              </div>
            )}
          </section>

          {/* 주의 필요 — 항상 렌더링 */}
          <section style={{ padding: 12, border: '1px solid #e5e9f0', borderRadius: 8, background: '#fff' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8, marginBottom: 8,
            }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#172033' }}>주의 필요</h3>
              <span style={{ color: '#8b95a7', fontSize: 11 }}>{warnings.length}</span>
            </div>
            {warnings.length === 0 ? (
              <p style={{ margin: '10px 0', color: '#8b95a7', fontSize: 12 }}>주의 항목이 없습니다.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {warnings.map((w, i) => (
                    <tr key={i}>
                      <td style={{ padding: '9px 6px', borderBottom: '1px solid #edf0f5', lineHeight: 1.4 }}>
                        {w}
                      </td>
                      <td style={{ padding: '9px 6px', borderBottom: '1px solid #edf0f5', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center',
                          height: 20, padding: '0 7px', borderRadius: 999,
                          fontSize: 10, fontWeight: 700,
                          background: '#fff1df', color: '#b75d00',
                        }}>확인</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

        </aside>
      </div>
    </div>
  )
}
