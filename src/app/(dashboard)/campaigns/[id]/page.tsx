'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Campaign, CampaignStatus, ParsedSheet, SheetRow, SheetTabType, SheetIndexItem } from '@/types'
import {
  ArrowLeft, RefreshCw, Calendar, CircleDollarSign, Users, Loader2,
  Pencil, Check, X, ExternalLink, Activity, Clock, Package,
  FileText, ListChecks, TrendingUp, Instagram, Youtube,
} from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from 'recharts'

// ── 상수 ────────────────────────────────────────────────────────
const STATUS_COLS: Record<CampaignStatus, string> = {
  proposal:  'bg-amber-100 text-amber-700 border-amber-200',
  active:    'bg-blue-100 text-blue-700 border-blue-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
}
const STATUS_LABELS: Record<CampaignStatus, string> = {
  proposal: '제안', active: '진행 중', completed: '완료',
}
const TAB_TYPE_META: Record<SheetTabType, { label: string; icon: React.ReactNode; color: string }> = {
  timeline:    { label: '전체 현황',     icon: <ListChecks size={13} />,  color: 'text-blue-600'   },
  engagement:  { label: '인게이지먼트', icon: <TrendingUp size={13} />,  color: 'text-indigo-600' },
  candidates:  { label: '후보 리스트',  icon: <Users size={13} />,       color: 'text-amber-600'  },
  content:     { label: '콘텐츠 검토',  icon: <FileText size={13} />,    color: 'text-purple-600' },
  schedule:    { label: '방문/예약',    icon: <Clock size={13} />,       color: 'text-teal-600'   },
  shipping:    { label: '배송',         icon: <Package size={13} />,     color: 'text-orange-600' },
  other:       { label: '기타',         icon: <Activity size={13} />,    color: 'text-gray-500'   },
}

// 성과 지표 컬럼 감지 — 헤더에 이 키워드가 포함되면 집계 대상
const METRIC_KEYWORDS = ['imp', '조회수', '좋아요', '댓글', '저장', '공유', '리포스트', 'eng', 'reach', '도달']
const CHART_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe']

// ── 유틸 ────────────────────────────────────────────────────────
function fmtNum(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000)      return `${(n / 10_000).toFixed(1)}만`
  return n.toLocaleString()
}
function fmtBudget(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`
  if (n >= 10_000)      return `${(n / 10_000).toFixed(0)}만원`
  return `${n.toLocaleString()}원`
}
function dateRange(s: string, e: string) {
  const fmt = (d: string) => d ? format(new Date(d), 'yyyy.MM.dd', { locale: ko }) : ''
  const sf = fmt(s), ef = fmt(e)
  if (!sf && !ef) return '기간 미정'
  return sf && ef ? `${sf} ~ ${ef}` : sf || ef
}

// 플랫폼 아이콘
function PlatformBadge({ platform }: { platform?: string }) {
  if (!platform) return null
  const map: Record<string, { label: string; cls: string }> = {
    Instagram: { label: 'IG',  cls: 'bg-pink-50 text-pink-600 border-pink-200' },
    TikTok:    { label: 'TK',  cls: 'bg-gray-900 text-white border-gray-700' },
    YouTube:   { label: 'YT',  cls: 'bg-red-50 text-red-600 border-red-200' },
    X:         { label: 'X',   cls: 'bg-gray-50 text-gray-700 border-gray-300' },
  }
  const s = map[platform]
  if (!s) return null
  return (
    <span className={clsx('px-1.5 py-0.5 rounded text-xs font-bold border', s.cls)}>
      {s.label}
    </span>
  )
}

// ── 성과 집계 ────────────────────────────────────────────────────
function getMetricCols(sheet: ParsedSheet) {
  return sheet.rawHeaders.filter(h =>
    METRIC_KEYWORDS.some(k => h.toLowerCase().includes(k))
  )
}
function sumMetric(rows: SheetRow[], col: string) {
  return rows.reduce((s, r) => {
    const v = r[col]
    return s + (typeof v === 'number' && !isNaN(v) ? v : 0)
  }, 0)
}

// ── 계정명 컬럼 탐지 ─────────────────────────────────────────────
function findAccountCol(headers: string[]): string | undefined {
  const priority = ['계정 아이디', '계정명', '계정', 'ID', '아이디', '이름', '名前', '진행 확정']
  for (const p of priority) {
    if (headers.find(h => h === p)) return p
  }
  return headers.find(h => h.toLowerCase().includes('계정') || h.toLowerCase().includes('이름') || h === 'ID')
}
function findUrlCol(headers: string[]): string | undefined {
  return headers.find(h => h.toLowerCase() === 'url')
}
function findFollowerCol(headers: string[]): string | undefined {
  return headers.find(h => /팔로워|fw/i.test(h))
}

// ── 테이블 컴포넌트 ───────────────────────────────────────────────
function SheetTable({ sheet }: { sheet: ParsedSheet }) {
  const headers = sheet.rawHeaders
  const hasSection = sheet.rows.some(r => r._section)
  const urlCol = findUrlCol(headers)
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const rows = sortCol
    ? [...sheet.rows].sort((a, b) => {
        const av = a[sortCol], bv = b[sortCol]
        const an = typeof av === 'number' ? av : 0
        const bn = typeof bv === 'number' ? bv : 0
        return sortDir === 'desc' ? bn - an : an - bn
      })
    : sheet.rows

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/80">
            {hasSection && (
              <th className="text-left text-xs font-medium text-gray-400 px-3 py-2 whitespace-nowrap">지점</th>
            )}
            <th className="text-left text-xs font-medium text-gray-400 px-3 py-2 whitespace-nowrap">플랫폼</th>
            {headers.map(h => {
              const isNum = METRIC_KEYWORDS.some(k => h.toLowerCase().includes(k))
              return (
                <th
                  key={h}
                  onClick={isNum ? () => handleSort(h) : undefined}
                  className={clsx(
                    'text-left text-xs font-medium text-gray-500 px-3 py-2 whitespace-nowrap',
                    isNum && 'cursor-pointer hover:text-indigo-600 select-none'
                  )}
                >
                  {h}
                  {sortCol === h && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
              {hasSection && (
                <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">
                  {row._section ?? ''}
                </td>
              )}
              <td className="px-3 py-2">
                <PlatformBadge platform={row._platform} />
              </td>
              {headers.map(h => {
                const v = row[h]
                // URL 컬럼 — 링크로 표시
                if (h === urlCol && v) {
                  return (
                    <td key={h} className="px-3 py-2 whitespace-nowrap">
                      <a href={String(v)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-500 hover:text-blue-600 text-xs">
                        <ExternalLink size={11} />링크
                      </a>
                    </td>
                  )
                }
                // URL처럼 생긴 값 (업로드 URL 등)
                if (typeof v === 'string' && v.startsWith('http')) {
                  return (
                    <td key={h} className="px-3 py-2 whitespace-nowrap">
                      <a href={v} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-500 text-xs">
                        <ExternalLink size={11} />
                      </a>
                    </td>
                  )
                }
                // boolean
                if (typeof v === 'boolean') {
                  return (
                    <td key={h} className="px-3 py-2">
                      {v
                        ? <Check size={14} className="text-green-500" />
                        : <X size={14} className="text-gray-300" />
                      }
                    </td>
                  )
                }
                // 숫자
                const isMetric = METRIC_KEYWORDS.some(k => h.toLowerCase().includes(k))
                const display = v === null || v === ''
                  ? <span className="text-gray-300">—</span>
                  : isMetric && typeof v === 'number'
                    ? fmtNum(v)
                    : String(v)

                return (
                  <td key={h} className={clsx(
                    'px-3 py-2 whitespace-nowrap text-gray-700',
                    isMetric && typeof v === 'number' && 'font-medium text-gray-900'
                  )}>
                    {display}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── 성과 차트 (timeline / engagement 탭용) ──────────────────────
function PerformanceSection({ sheet }: { sheet: ParsedSheet }) {
  const metricCols = getMetricCols(sheet)
  const [activeMetric, setActiveMetric] = useState(metricCols[0] ?? '')

  if (metricCols.length === 0) return null

  const accountCol = findAccountCol(sheet.rawHeaders)
  const followCol  = findFollowerCol(sheet.rawHeaders)

  // 요약 통계 카드
  const stats = metricCols
    .filter(m => sumMetric(sheet.rows, m) > 0)
    .slice(0, 6)
    .map(col => ({ col, total: sumMetric(sheet.rows, col) }))

  // 차트 데이터 (상위 10명, 선택한 지표 기준 정렬)
  const chartData = sheet.rows
    .filter(r => typeof r[activeMetric] === 'number' && (r[activeMetric] as number) > 0)
    .sort((a, b) => (b[activeMetric] as number) - (a[activeMetric] as number))
    .slice(0, 10)
    .map(r => ({
      name: String(r[accountCol ?? ''] ?? r[followCol ?? ''] ?? '?').slice(0, 14),
      value: r[activeMetric] as number,
      _platform: r._platform,
    }))

  if (stats.length === 0) return null

  return (
    <div className="space-y-4 mb-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map(({ col, total }) => (
          <div key={col} className="bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1 truncate">{col}</p>
            <p className="text-base font-bold text-gray-900">{fmtNum(total)}</p>
          </div>
        ))}
      </div>

      {/* 차트 */}
      {chartData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <span className="text-xs font-semibold text-gray-700">
              인플루언서별 성과 (상위 {chartData.length}명)
            </span>
            <div className="flex gap-1 flex-wrap">
              {metricCols.filter(m => sumMetric(sheet.rows, m) > 0).slice(0, 6).map(m => (
                <button
                  key={m}
                  onClick={() => setActiveMetric(m)}
                  className={clsx(
                    'px-2 py-0.5 text-xs rounded-full border transition-colors',
                    activeMetric === m
                      ? 'bg-indigo-500 text-white border-indigo-500'
                      : 'border-gray-200 text-gray-500 hover:border-indigo-300'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={v => fmtNum(Number(v))} tick={{ fontSize: 10 }} width={46} />
              <Tooltip formatter={(v: unknown) => fmtNum(Number(v))} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── 메인 ────────────────────────────────────────────────────────
export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const token = user?.uid ?? ''

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [sheetsInput, setSheetsInput] = useState('')
  const [editingStatus, setEditingStatus] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [activeSheetKey, setActiveSheetKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      const c = data.campaign as Campaign
      setCampaign(c)
      setSheetsInput(c?.sheetsUrl ?? '')
      if (c?.sheetsIndex?.length) {
        setActiveSheetKey(prev => prev ?? c.sheetsIndex![0].key)
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [id, token])

  useEffect(() => { load() }, [load])

  const syncSheets = async () => {
    if (!sheetsInput.trim()) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch(`/api/campaigns/${id}/sheets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sheetsUrl: sheetsInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSyncResult({ ok: true, msg: `${data.parsedTabs}개 탭 동기화 완료 (전체 ${data.totalTabs}개)` })
      await load()
    } catch (err) {
      setSyncResult({ ok: false, msg: err instanceof Error ? err.message : '동기화 실패' })
    } finally { setSyncing(false) }
  }

  const changeStatus = async (s: CampaignStatus) => {
    setSavingStatus(true)
    try {
      await fetch(`/api/campaigns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: s }),
      })
      setCampaign(prev => prev ? { ...prev, status: s } : prev)
      setEditingStatus(false)
    } finally { setSavingStatus(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-300">
        <Loader2 size={24} className="animate-spin" />
      </div>
    )
  }
  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
        <p className="text-sm">캠페인을 찾을 수 없습니다.</p>
        <button onClick={() => router.back()} className="text-blue-500 text-sm hover:underline">돌아가기</button>
      </div>
    )
  }

  const index: SheetIndexItem[] = campaign.sheetsIndex ?? []
  const activeSheet: ParsedSheet | undefined =
    activeSheetKey && campaign.sheets ? campaign.sheets[activeSheetKey] : undefined

  const showPerf = activeSheet && (activeSheet.type === 'timeline' || activeSheet.type === 'engagement')

  return (
    <div className="h-full overflow-y-auto bg-gray-50/40">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">

        {/* 뒤로가기 */}
        <button onClick={() => router.push('/campaigns')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
          <ArrowLeft size={14} />캠페인 목록
        </button>

        {/* 헤더 카드 */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-400 mb-1">{campaign.clientName}</p>
              <h1 className="text-xl font-bold text-gray-900">{campaign.campaignName}</h1>
            </div>
            {/* 상태 */}
            {editingStatus ? (
              <div className="flex items-center gap-2">
                <select
                  defaultValue={campaign.status}
                  onChange={e => changeStatus(e.target.value as CampaignStatus)}
                  disabled={savingStatus}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1 outline-none"
                >
                  {(Object.keys(STATUS_LABELS) as CampaignStatus[]).map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <button onClick={() => setEditingStatus(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={15} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingStatus(true)}
                className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border', STATUS_COLS[campaign.status])}
              >
                {STATUS_LABELS[campaign.status]}<Pencil size={11} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <Calendar size={13} className="text-gray-400" />
              {dateRange(campaign.startDate, campaign.endDate)}
            </span>
            {campaign.budget > 0 && (
              <span className="flex items-center gap-1.5">
                <CircleDollarSign size={13} className="text-gray-400" />
                {fmtBudget(campaign.budget)}
              </span>
            )}
            {index.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Users size={13} className="text-gray-400" />
                총 {index.reduce((s, i) => s + i.rowCount, 0)}건
              </span>
            )}
          </div>
          {campaign.memo && (
            <p className="mt-3 text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{campaign.memo}</p>
          )}
        </div>

        {/* Google Sheets 동기화 */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Google Sheets 연동</h2>
          <div className="flex gap-2">
            <input
              value={sheetsInput}
              onChange={e => setSheetsInput(e.target.value)}
              placeholder="Google Sheets URL을 붙여넣으세요..."
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            />
            <button
              onClick={syncSheets}
              disabled={syncing || !sheetsInput.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 shrink-0"
            >
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {syncing ? '동기화 중...' : '동기화'}
            </button>
          </div>
          {syncResult && (
            <p className={clsx('text-xs mt-2 flex items-center gap-1', syncResult.ok ? 'text-green-600' : 'text-red-500')}>
              {syncResult.ok ? <Check size={11} /> : <X size={11} />}
              {syncResult.msg}
            </p>
          )}
          {campaign.sheetsLastSyncAt && !syncResult && (
            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
              <Check size={11} className="text-green-500" />
              마지막 동기화: {format(new Date(campaign.sheetsLastSyncAt), 'MM.dd HH:mm', { locale: ko })}
            </p>
          )}
        </div>

        {/* 탭 네비게이션 + 데이터 */}
        {index.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {/* 탭 헤더 */}
            <div className="flex gap-0 border-b border-gray-100 overflow-x-auto">
              {index.map(item => {
                const meta = TAB_TYPE_META[item.type]
                const isActive = activeSheetKey === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveSheetKey(item.key)}
                    className={clsx(
                      'flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors shrink-0',
                      isActive
                        ? 'border-indigo-500 text-indigo-600 bg-indigo-50/50'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    <span className={isActive ? meta.color : 'text-gray-400'}>{meta.icon}</span>
                    {item.displayName}
                    <span className={clsx(
                      'ml-1 px-1.5 py-0.5 rounded-full text-xs',
                      isActive ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'
                    )}>
                      {item.rowCount}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* 탭 콘텐츠 */}
            <div className="p-5">
              {activeSheet ? (
                <>
                  {/* 성과 요약 + 차트 (timeline / engagement 탭만) */}
                  {showPerf && <PerformanceSection sheet={activeSheet} />}

                  {/* 데이터 테이블 */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-gray-500">
                      {activeSheet.rowCount}행
                      {activeSheet.rows.some(r => r._section) && ' · 지점별 구분'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {TAB_TYPE_META[activeSheet.type].label}
                    </span>
                  </div>
                  <SheetTable sheet={activeSheet} />
                </>
              ) : (
                <div className="flex items-center justify-center py-12 text-gray-300 text-sm">
                  탭을 선택하세요
                </div>
              )}
            </div>
          </div>
        ) : (
          /* 미연동 안내 */
          <div className="flex flex-col items-center justify-center py-16 gap-3 border-2 border-dashed border-gray-200 rounded-2xl text-gray-300">
            <Instagram size={28} />
            <p className="text-sm text-gray-400 text-center">
              Google Sheets URL을 입력하면<br />탭별로 인플루언서 데이터가 자동으로 불러와집니다.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
