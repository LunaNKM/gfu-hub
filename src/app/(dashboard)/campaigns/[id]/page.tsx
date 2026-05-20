'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Campaign, CampaignStatus, ParsedSheet, SheetRow, SheetTabType, SheetIndexItem } from '@/types'
import {
  ArrowLeft, RefreshCw, Calendar, CircleDollarSign, Users, Loader2,
  Pencil, Check, X, ExternalLink, Activity, Clock, Package,
  FileText, ListChecks, TrendingUp, ChevronDown, ChevronUp,
  Heart, MessageCircle, Bookmark, Share2, Eye, Zap,
} from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from 'recharts'

// ── 상태/탭 메타 ─────────────────────────────────────────────────
const STATUS_COLS: Record<CampaignStatus, string> = {
  proposal:  'bg-amber-100 text-amber-700 border-amber-200',
  active:    'bg-blue-100 text-blue-700 border-blue-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
}
const STATUS_LABELS: Record<CampaignStatus, string> = {
  proposal: '제안', active: '진행 중', completed: '완료',
}
const TAB_TYPE_META: Record<SheetTabType, { label: string; icon: React.ReactNode }> = {
  timeline:    { label: '전체 현황',     icon: <ListChecks size={13} />   },
  engagement:  { label: '인게이지먼트', icon: <TrendingUp size={13} />   },
  candidates:  { label: '후보 리스트',  icon: <Users size={13} />        },
  content:     { label: '콘텐츠 검토',  icon: <FileText size={13} />     },
  schedule:    { label: '방문/예약',    icon: <Clock size={13} />        },
  shipping:    { label: '배송',         icon: <Package size={13} />      },
  other:       { label: '기타',         icon: <Activity size={13} />     },
}

// ── 플랫폼 색상 ──────────────────────────────────────────────────
const PLATFORM_COLOR: Record<string, string> = {
  Instagram: '#e1306c', TikTok: '#010101', YouTube: '#ff0000', X: '#1d9bf0',
}
const CHART_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#f43f5e']

// ── 유틸 ─────────────────────────────────────────────────────────
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
  const f = (d: string) => d ? format(new Date(d), 'yyyy.MM.dd', { locale: ko }) : ''
  const sf = f(s), ef = f(e)
  return sf && ef ? `${sf} ~ ${ef}` : sf || ef || '기간 미정'
}

// ── 컬럼 탐지 헬퍼 ───────────────────────────────────────────────
function findCol(headers: string[], ...keywords: string[]): string | undefined {
  // 정확히 일치
  for (const kw of keywords) {
    const h = headers.find(h => h === kw); if (h) return h
  }
  // 부분 일치
  for (const kw of keywords) {
    const kl = kw.toLowerCase()
    const h = headers.find(h => h.toLowerCase().includes(kl)); if (h) return h
  }
}

// ── 시트 분석 — 컬럼 감지 + 행별 지표 계산 ──────────────────────
interface ColMap {
  account?: string; followers?: string; url?: string; status?: string
  imp?: string; likes?: string; comments?: string; saves?: string
  shares?: string; reposts?: string; engTotal?: string; platform?: string
}

function detectCols(headers: string[]): ColMap {
  return {
    account:  findCol(headers, '계정 아이디', '계정명', '계정', 'ID', '아이디', '이름', '名前', '진행 확정'),
    followers:findCol(headers, '팔로워', 'Fw', 'FW', '팔로워 수'),
    url:      findCol(headers, 'URL', 'url'),
    status:   findCol(headers, '상태', '진행 상황', '진행 여부'),
    imp:      findCol(headers, '총 IMP', 'IMP', '조회수', '노출', '총 조회수'),
    likes:    findCol(headers, '좋아요'),
    comments: findCol(headers, '댓글'),
    saves:    findCol(headers, '저장 수', '저장'),
    shares:   findCol(headers, '공유'),
    reposts:  findCol(headers, '리포스트'),
    engTotal: findCol(headers, '총 ENG 수', 'ENG 합'),
  }
}

function numVal(row: SheetRow, col?: string): number {
  if (!col) return 0
  const v = row[col]
  return typeof v === 'number' && !isNaN(v) ? v : 0
}

interface RowMetrics {
  account: string
  followers: number
  imp: number
  likes: number
  comments: number
  saves: number
  shares: number
  reposts: number
  engSum: number   // 좋아요+댓글+저장+공유+리포스트
  er: number       // engSum / imp * 100
  status: string
  platform: string
  url: string
  _section: string
}

function computeRows(sheet: ParsedSheet, cols: ColMap): RowMetrics[] {
  return sheet.rows.map(r => {
    const imp      = numVal(r, cols.imp)
    const likes    = numVal(r, cols.likes)
    const comments = numVal(r, cols.comments)
    const saves    = numVal(r, cols.saves)
    const shares   = numVal(r, cols.shares)
    const reposts  = numVal(r, cols.reposts)
    const engSum   = likes + comments + saves + shares + reposts
    const er       = imp > 0 ? (engSum / imp) * 100 : 0
    const followers= numVal(r, cols.followers)
    return {
      account:  String(r[cols.account ?? ''] ?? '').trim() || '?',
      followers,
      imp, likes, comments, saves, shares, reposts, engSum, er,
      status:   String(r[cols.status ?? ''] ?? ''),
      platform: String(r._platform ?? ''),
      url:      String(r[cols.url ?? ''] ?? ''),
      _section: String(r._section ?? ''),
    }
  }).filter(r => r.account !== '?' || r.imp > 0)
}

// ER 색상 — 일반 인스타 기준
function erColor(er: number): string {
  if (er <= 0)  return 'text-gray-400'
  if (er >= 5)  return 'text-emerald-600'
  if (er >= 3)  return 'text-blue-600'
  if (er >= 1)  return 'text-amber-600'
  return 'text-red-500'
}
function erBg(er: number): string {
  if (er <= 0)  return 'bg-gray-50 text-gray-400'
  if (er >= 5)  return 'bg-emerald-50 text-emerald-700'
  if (er >= 3)  return 'bg-blue-50 text-blue-700'
  if (er >= 1)  return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-600'
}

// ── 카테고리 분석 헬퍼 ───────────────────────────────────────────
// 카테고리형 컬럼으로 볼 수 없는 헤더 키워드
const SKIP_CAT_PATTERNS = [
  'url', '링크', '날짜', '일자', '일정', '주소', '연락처', '전화',
  '생년', '번호', '코드', '초안', '캡션', '피드백', '비고', '메모',
  '가이드', '구성안', '시술명', '이름', '성명', '소개', '방문',
  'note', '참고', '스케줄', '운송', '송장', 'no.', '제공',
]

function findCategoricalCols(sheet: ParsedSheet, cols: ColMap): string[] {
  const skipCols = new Set(Object.values(cols).filter(Boolean) as string[])
  return sheet.rawHeaders.filter(h => {
    if (!h) return false
    if (skipCols.has(h)) return false
    const hl = h.toLowerCase()
    if (SKIP_CAT_PATTERNS.some(p => hl.includes(p))) return false

    const values = sheet.rows
      .map(r => r[h])
      .filter(v => v !== null && v !== undefined && v !== '' && typeof v === 'string') as string[]

    if (values.length < 3) return false
    const unique = new Set(values)
    // 고유값 2~15개, 값이 반복되어야 함 (80% 이상 고유하면 제외)
    if (unique.size < 2 || unique.size > 15) return false
    if (unique.size >= values.length * 0.8) return false
    if ([...unique].some(v => v.startsWith('http') || v.startsWith('www'))) return false
    return true
  })
}

interface CategoryGroup {
  name: string; count: number
  totalImp: number; avgImp: number
  totalEng: number; avgER: number
}

function groupByCategory(sheetRows: SheetRow[], col: string, cols: ColMap): CategoryGroup[] {
  const groups: Record<string, { imp: number; eng: number; count: number }> = {}
  sheetRows.forEach(row => {
    const val = String(row[col] ?? '').trim()
    if (!val || val === 'null') return
    const imp      = numVal(row, cols.imp)
    const likes    = numVal(row, cols.likes)
    const comments = numVal(row, cols.comments)
    const saves    = numVal(row, cols.saves)
    const shares   = numVal(row, cols.shares)
    const reposts  = numVal(row, cols.reposts)
    const eng = likes + comments + saves + shares + reposts
    if (!groups[val]) groups[val] = { imp: 0, eng: 0, count: 0 }
    groups[val].imp   += imp
    groups[val].eng   += eng
    groups[val].count += 1
  })
  return Object.entries(groups)
    .map(([name, g]) => ({
      name, count: g.count,
      totalImp: g.imp,
      avgImp: g.count > 0 ? Math.round(g.imp / g.count) : 0,
      totalEng: g.eng,
      avgER: g.imp > 0 ? (g.eng / g.imp) * 100 : 0,
    }))
    .sort((a, b) => b.avgER - a.avgER || b.totalImp - a.totalImp)
}

// ── 카테고리별 분석 컴포넌트 ─────────────────────────────────────
function CategoryAnalysis({ sheet, cols }: { sheet: ParsedSheet; cols: ColMap }) {
  const catCols = useMemo(() => findCategoricalCols(sheet, cols), [sheet, cols])
  const [activeCol, setActiveCol] = useState<string>(() => catCols[0] ?? '')
  const [metric, setMetric] = useState<'er' | 'avgImp'>('er')

  // catCols가 바뀌면 activeCol 초기화
  useEffect(() => {
    if (catCols.length > 0 && !catCols.includes(activeCol)) setActiveCol(catCols[0])
  }, [catCols, activeCol])

  const groups = useMemo(
    () => activeCol ? groupByCategory(sheet.rows, activeCol, cols) : [],
    [sheet.rows, activeCol, cols]
  )

  if (catCols.length === 0) return null

  const hasPerf = groups.some(g => g.avgER > 0 || g.totalImp > 0)
  const chartData = groups.map(g => ({
    name: g.name.length > 14 ? g.name.slice(0, 13) + '…' : g.name,
    fullName: g.name,
    value: metric === 'er' ? parseFloat(g.avgER.toFixed(2)) : g.avgImp,
    avgER: g.avgER,
  }))

  const fmtVal = (v: number) => metric === 'er' ? `${v.toFixed(2)}%` : fmtNum(v)
  const barColor = (avgER: number) =>
    metric === 'er'
      ? (avgER >= 5 ? '#10b981' : avgER >= 3 ? '#6366f1' : avgER >= 1 ? '#f59e0b' : '#f87171')
      : '#6366f1'

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-wrap gap-2">
        <span className="text-sm font-semibold text-gray-800">카테고리별 분석</span>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 컬럼 선택 탭 */}
          <div className="flex gap-1">
            {catCols.map(col => (
              <button key={col} onClick={() => setActiveCol(col)}
                className={clsx(
                  'px-2.5 py-1 text-xs rounded-full border transition-colors',
                  activeCol === col
                    ? 'bg-indigo-500 text-white border-indigo-500'
                    : 'border-gray-200 text-gray-500 hover:border-indigo-300'
                )}>
                {col}
              </button>
            ))}
          </div>
          {/* 지표 토글 */}
          {hasPerf && (
            <div className="flex gap-1 pl-2 border-l border-gray-100">
              {([['er', 'avg ER'], ['avgImp', '평균 조회수']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setMetric(k)}
                  className={clsx(
                    'px-2 py-1 text-xs rounded-full border transition-colors',
                    metric === k ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-400'
                  )}>{l}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="p-5">
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-300 text-center py-6">데이터 없음</p>
        ) : (
          <div className="flex gap-6">
            {/* 가로 바 차트 */}
            <div className="flex-1 min-w-0">
              <ResponsiveContainer width="100%" height={Math.max(chartData.length * 38, 140)}>
                <BarChart data={chartData} layout="vertical"
                  margin={{ top: 0, right: 48, bottom: 0, left: 4 }}>
                  <XAxis type="number" tickFormatter={v => metric === 'er' ? `${v}%` : fmtNum(Number(v))}
                    tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={104}
                    axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: unknown) => [fmtVal(Number(v)), metric === 'er' ? 'avg ER' : '평균 조회수']}
                    labelFormatter={(label: unknown) => {
                      const labelStr = String(label ?? '')
                      const g = groups.find(g => g.name.startsWith(labelStr.replace('…', '')))
                      return g ? `${g.name} (${g.count}명)` : labelStr
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 5, 5, 0]} maxBarSize={22}
                    label={{ position: 'right', fontSize: 10, formatter: (v: unknown) => fmtVal(Number(v)) }}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={barColor(entry.avgER)} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 오른쪽 요약 카드 */}
            <div className="shrink-0 w-44 space-y-2">
              {groups.map(g => (
                <div key={g.name}
                  className="border border-gray-100 rounded-xl p-2.5 hover:border-indigo-200 transition-colors">
                  <p className="text-xs font-medium text-gray-800 leading-snug mb-1.5" title={g.name}>
                    {g.name.length > 12 ? g.name.slice(0, 11) + '…' : g.name}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{g.count}명</span>
                    <div className="flex flex-col items-end gap-0.5">
                      {g.avgER > 0 && (
                        <span className={clsx('text-xs font-bold px-1.5 py-0.5 rounded-full', erBg(g.avgER))}>
                          {g.avgER.toFixed(2)}%
                        </span>
                      )}
                      {g.totalImp > 0 && (
                        <span className="text-xs text-gray-400">{fmtNum(g.totalImp)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {/* ER 범례 */}
              {metric === 'er' && (
                <div className="pt-2 border-t border-gray-50 space-y-1">
                  {[
                    { color: '#10b981', label: '5%↑ 매우 높음' },
                    { color: '#6366f1', label: '3~5% 양호' },
                    { color: '#f59e0b', label: '1~3% 보통' },
                    { color: '#f87171', label: '1%↓ 낮음' },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs text-gray-400">{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 플랫폼 배지 ──────────────────────────────────────────────────
function PlatformBadge({ p }: { p: string }) {
  const map: Record<string, string> = {
    Instagram: 'bg-pink-50 text-pink-600 border-pink-200',
    TikTok:    'bg-gray-900 text-white border-gray-700',
    YouTube:   'bg-red-50 text-red-600 border-red-200',
    X:         'bg-gray-50 text-gray-700 border-gray-300',
  }
  if (!p || !map[p]) return null
  return (
    <span className={clsx('px-1.5 py-0.5 rounded text-xs font-bold border shrink-0', map[p])}>
      {p === 'Instagram' ? 'IG' : p === 'TikTok' ? 'TK' : p === 'YouTube' ? 'YT' : 'X'}
    </span>
  )
}

// ── 대시보드 (성과 데이터 있는 탭용) ─────────────────────────────
function PerformanceDashboard({
  sheet, rows, cols, campaignBudget,
}: {
  sheet: ParsedSheet; rows: RowMetrics[]; cols: ColMap; campaignBudget: number
}) {
  const [sortBy, setSortBy] = useState<'imp' | 'er'>('imp')
  const [showTable, setShowTable] = useState(false)

  const withImp = rows.filter(r => r.imp > 0)
  const withEr  = rows.filter(r => r.er > 0)

  // 집계
  const totalImp      = withImp.reduce((s, r) => s + r.imp, 0)
  const totalLikes    = rows.reduce((s, r) => s + r.likes, 0)
  const totalComments = rows.reduce((s, r) => s + r.comments, 0)
  const totalSaves    = rows.reduce((s, r) => s + r.saves, 0)
  const totalShares   = rows.reduce((s, r) => s + r.shares + r.reposts, 0)
  const totalEng      = totalLikes + totalComments + totalSaves + totalShares
  const avgER         = totalImp > 0 ? (totalEng / totalImp) * 100 : 0
  const cpv           = totalImp > 0 && campaignBudget > 0 ? campaignBudget / totalImp : 0

  // 상태 분포
  const statusMap: Record<string, number> = {}
  rows.forEach(r => { if (r.status) statusMap[r.status] = (statusMap[r.status] ?? 0) + 1 })
  const postedCount = Object.entries(statusMap)
    .filter(([k]) => k.includes('투고 완료') || k.includes('완료'))
    .reduce((s, [, v]) => s + v, 0)

  // 플랫폼 분포
  const platformMap: Record<string, number> = {}
  rows.forEach(r => { if (r.platform) platformMap[r.platform] = (platformMap[r.platform] ?? 0) + 1 })
  const platformData = Object.entries(platformMap).map(([name, value]) => ({ name, value }))

  // 상위 10명 차트
  const topByImp = [...withImp].sort((a, b) => b.imp - a.imp).slice(0, 10)
  const topByEr  = [...withEr].sort((a, b) => b.er - a.er).slice(0, 10)

  const chartData = sortBy === 'imp' ? topByImp : topByEr
  const chartKey  = sortBy === 'imp' ? 'imp' : 'er'
  const chartFmt  = sortBy === 'imp'
    ? (v: number) => fmtNum(v)
    : (v: number) => `${v.toFixed(2)}%`

  // 리더보드 (정렬 가능)
  const [lbSort, setLbSort] = useState<'imp' | 'er' | 'followers'>('imp')
  const leaderboard = useMemo(() =>
    [...rows]
      .filter(r => r.imp > 0 || r.followers > 0)
      .sort((a, b) => b[lbSort] - a[lbSort])
      .slice(0, 20),
    [rows, lbSort]
  )

  const hasEng = totalEng > 0
  const hasImp = totalImp > 0

  return (
    <div className="space-y-5">
      {/* ── Hero KPI 카드 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 총 조회수 */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 col-span-1">
          <div className="flex items-center gap-1.5 text-gray-400 mb-2">
            <Eye size={14} /><span className="text-xs">총 조회수</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{hasImp ? fmtNum(totalImp) : '—'}</p>
          {cpv > 0 && (
            <p className="text-xs text-gray-400 mt-1.5">CPV ≈ {Math.round(cpv).toLocaleString()}원</p>
          )}
        </div>
        {/* 평균 ER */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center gap-1.5 text-gray-400 mb-2">
            <Zap size={14} /><span className="text-xs">평균 ER</span>
          </div>
          <p className={clsx('text-3xl font-bold', erColor(avgER))}>
            {hasEng ? `${avgER.toFixed(2)}%` : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-1.5">
            {avgER >= 5 ? '🔥 매우 높음' : avgER >= 3 ? '✅ 양호' : avgER >= 1 ? '⚠️ 보통' : avgER > 0 ? '🔻 낮음' : '데이터 없음'}
          </p>
        </div>
        {/* 투고 완료 */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center gap-1.5 text-gray-400 mb-2">
            <Check size={14} /><span className="text-xs">투고 완료</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {postedCount > 0 ? postedCount : withImp.length}
            <span className="text-base font-normal text-gray-400"> / {rows.length}</span>
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${rows.length > 0 ? ((postedCount || withImp.length) / rows.length) * 100 : 0}%` }}
            />
          </div>
        </div>
        {/* 총 인플루언서 */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center gap-1.5 text-gray-400 mb-2">
            <Users size={14} /><span className="text-xs">인플루언서</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{rows.length}</p>
          {platformData.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {platformData.map(({ name, value }) => (
                <span key={name} className="text-xs text-gray-500">
                  {name === 'Instagram' ? 'IG' : name === 'TikTok' ? 'TK' : name === 'YouTube' ? 'YT' : name} {value}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 인게이지먼트 세부 ── */}
      {hasEng && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: <Heart size={13} />, label: '좋아요', val: totalLikes,    color: 'text-pink-500' },
            { icon: <MessageCircle size={13} />, label: '댓글', val: totalComments, color: 'text-amber-500' },
            { icon: <Bookmark size={13} />, label: '저장',  val: totalSaves,    color: 'text-teal-500' },
            { icon: <Share2 size={13} />, label: '공유+리포스트', val: totalShares, color: 'text-blue-500' },
          ].filter(m => m.val > 0).map(m => (
            <div key={m.label} className="bg-white border border-gray-100 rounded-xl p-4">
              <div className={clsx('flex items-center gap-1.5 mb-1', m.color)}>
                {m.icon}<span className="text-xs text-gray-400">{m.label}</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{fmtNum(m.val)}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── 차트 2개 ── */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 왼쪽: 인플루언서 랭킹 */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-gray-800">인플루언서 순위</span>
              <div className="flex gap-1">
                {['imp', 'er'].map(k => (
                  <button key={k} onClick={() => setSortBy(k as 'imp' | 'er')}
                    className={clsx('px-2.5 py-1 text-xs rounded-full border transition-colors',
                      sortBy === k ? 'bg-indigo-500 text-white border-indigo-500' : 'border-gray-200 text-gray-500'
                    )}>
                    {k === 'imp' ? '조회수' : 'ER'}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData.map(r => ({ name: r.account.slice(0, 12), value: r[chartKey] }))}
                layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
                <XAxis type="number" tickFormatter={v => chartFmt(Number(v))} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={72} />
                <Tooltip formatter={(v: unknown) => chartFmt(Number(v))} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 오른쪽: 플랫폼 분포 + 상태 분포 */}
          <div className="flex flex-col gap-3">
            {/* 플랫폼 파이 */}
            {platformData.length > 1 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5 flex-1">
                <span className="text-sm font-semibold text-gray-800 block mb-3">플랫폼 분포</span>
                <div className="flex items-center gap-4">
                  <PieChart width={100} height={100}>
                    <Pie data={platformData} cx={46} cy={46} innerRadius={28} outerRadius={46}
                      dataKey="value" paddingAngle={2}>
                      {platformData.map((entry, i) => (
                        <Cell key={i} fill={PLATFORM_COLOR[entry.name] ?? CHART_COLORS[i]} />
                      ))}
                    </Pie>
                  </PieChart>
                  <div className="space-y-1.5">
                    {platformData.map((entry, i) => (
                      <div key={entry.name} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: PLATFORM_COLOR[entry.name] ?? CHART_COLORS[i] }} />
                        <span className="text-xs text-gray-600">{entry.name}</span>
                        <span className="text-xs font-bold text-gray-900 ml-auto">{entry.value}명</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 상태 분포 */}
            {Object.keys(statusMap).length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5 flex-1">
                <span className="text-sm font-semibold text-gray-800 block mb-3">진행 상태</span>
                <div className="space-y-2">
                  {Object.entries(statusMap)
                    .sort(([, a], [, b]) => b - a)
                    .map(([status, count]) => (
                      <div key={status}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-gray-600">{status}</span>
                          <span className="text-xs font-medium text-gray-900">{count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100">
                          <div className="h-full rounded-full bg-indigo-400"
                            style={{ width: `${(count / rows.length) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 카테고리별 분석 ── */}
      <CategoryAnalysis sheet={sheet} cols={cols} />

      {/* ── 리더보드 ── */}
      {leaderboard.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">인플루언서 리더보드</span>
            <div className="flex gap-1">
              {([['imp', '조회수'], ['er', 'ER'], ['followers', '팔로워']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setLbSort(k)}
                  className={clsx('px-2.5 py-1 text-xs rounded-full border transition-colors',
                    lbSort === k ? 'bg-indigo-500 text-white border-indigo-500' : 'border-gray-200 text-gray-500'
                  )}>{l}</button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="text-left text-xs text-gray-400 font-medium px-4 py-2.5 w-8">#</th>
                  <th className="text-left text-xs text-gray-400 font-medium px-3 py-2.5">계정</th>
                  <th className="text-right text-xs text-gray-400 font-medium px-3 py-2.5">팔로워</th>
                  {hasImp && <th className="text-right text-xs text-gray-400 font-medium px-3 py-2.5">조회수</th>}
                  {hasEng && <th className="text-right text-xs text-gray-400 font-medium px-3 py-2.5">ER</th>}
                  {hasEng && <th className="text-right text-xs text-gray-400 font-medium px-3 py-2.5">ENG</th>}
                  <th className="text-left text-xs text-gray-400 font-medium px-3 py-2.5">상태</th>
                  <th className="px-3 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r, i) => (
                  <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <PlatformBadge p={r.platform} />
                        <div>
                          <p className="text-sm font-medium text-gray-900 leading-none">{r.account}</p>
                          {r._section && <p className="text-xs text-gray-400 mt-0.5">{r._section}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm text-gray-600">
                      {r.followers > 0 ? fmtNum(r.followers) : '—'}
                    </td>
                    {hasImp && (
                      <td className="px-3 py-2.5 text-right text-sm font-medium text-gray-900">
                        {r.imp > 0 ? fmtNum(r.imp) : '—'}
                      </td>
                    )}
                    {hasEng && (
                      <td className="px-3 py-2.5 text-right">
                        {r.er > 0
                          ? <span className={clsx('text-sm font-bold px-1.5 py-0.5 rounded', erBg(r.er))}>
                              {r.er.toFixed(2)}%
                            </span>
                          : <span className="text-xs text-gray-300">—</span>
                        }
                      </td>
                    )}
                    {hasEng && (
                      <td className="px-3 py-2.5 text-right text-sm text-gray-600">
                        {r.engSum > 0 ? fmtNum(r.engSum) : '—'}
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      {r.status && (
                        <span className={clsx(
                          'text-xs px-2 py-0.5 rounded-full',
                          r.status.includes('완료') ? 'bg-green-50 text-green-700' :
                          r.status === 'NG' ? 'bg-red-50 text-red-600' :
                          'bg-gray-50 text-gray-500'
                        )}>{r.status}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noopener noreferrer"
                          className="text-gray-300 hover:text-blue-500 transition-colors">
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 원본 데이터 토글 ── */}
      <button
        onClick={() => setShowTable(v => !v)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        {showTable ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {showTable ? '원본 데이터 숨기기' : '원본 데이터 보기'} ({sheet.rowCount}행)
      </button>
      {showTable && <RawTable sheet={sheet} />}
    </div>
  )
}

// ── 비성과 탭용 간단 뷰 ──────────────────────────────────────────
function SimpleSheetView({ sheet }: { sheet: ParsedSheet }) {
  const [showAll, setShowAll] = useState(false)
  const rows = showAll ? sheet.rows : sheet.rows.slice(0, 30)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
          총 {sheet.rowCount}행
        </span>
      </div>
      <RawTable sheet={sheet} rows={rows} />
      {sheet.rowCount > 30 && !showAll && (
        <button onClick={() => setShowAll(true)}
          className="text-xs text-indigo-500 hover:text-indigo-600">
          +{sheet.rowCount - 30}행 더 보기
        </button>
      )}
    </div>
  )
}

// ── 원본 테이블 ───────────────────────────────────────────────────
function RawTable({ sheet, rows: overrideRows }: { sheet: ParsedSheet; rows?: SheetRow[] }) {
  const rows = overrideRows ?? sheet.rows
  const hasSection = rows.some(r => r._section)
  const urlCols = sheet.rawHeaders.filter(h =>
    h.toLowerCase() === 'url' || h.toLowerCase().includes('업로드')
  )
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            {hasSection && <th className="text-left text-gray-400 font-medium px-3 py-2 whitespace-nowrap">지점</th>}
            <th className="text-left text-gray-400 font-medium px-3 py-2 whitespace-nowrap">플랫폼</th>
            {sheet.rawHeaders.map(h => (
              <th key={h} className="text-left text-gray-500 font-medium px-3 py-2 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/40">
              {hasSection && <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap">{row._section ?? ''}</td>}
              <td className="px-3 py-1.5"><PlatformBadge p={String(row._platform ?? '')} /></td>
              {sheet.rawHeaders.map(h => {
                const v = row[h]
                if (typeof v === 'string' && v.startsWith('http')) {
                  return (
                    <td key={h} className="px-3 py-1.5 whitespace-nowrap">
                      <a href={v} target="_blank" rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-600">
                        <ExternalLink size={11} />
                      </a>
                    </td>
                  )
                }
                if (typeof v === 'boolean') {
                  return <td key={h} className="px-3 py-1.5">
                    {v ? <Check size={12} className="text-green-500" /> : <X size={12} className="text-gray-300" />}
                  </td>
                }
                return (
                  <td key={h} className="px-3 py-1.5 text-gray-700 whitespace-nowrap">
                    {v === null || v === '' ? <span className="text-gray-200">—</span> : String(v)}
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

// ── 메인 페이지 ───────────────────────────────────────────────────
export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const { user } = useAuth()
  const token   = user?.uid ?? ''

  const [campaign, setCampaign]         = useState<Campaign | null>(null)
  const [loading, setLoading]           = useState(true)
  const [syncing, setSyncing]           = useState(false)
  const [syncResult, setSyncResult]     = useState<{ ok: boolean; msg: string } | null>(null)
  const [sheetsInput, setSheetsInput]   = useState('')
  const [editingStatus, setEditingStatus] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [activeKey, setActiveKey]       = useState<string | null>(null)

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
      setActiveKey(prev => prev ?? c?.sheetsIndex?.[0]?.key ?? null)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [id, token])

  useEffect(() => { load() }, [load])

  const syncSheets = async () => {
    if (!sheetsInput.trim()) return
    setSyncing(true); setSyncResult(null)
    try {
      const res = await fetch(`/api/campaigns/${id}/sheets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sheetsUrl: sheetsInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSyncResult({ ok: true, msg: `${data.parsedTabs}개 탭 동기화 완료` })
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

  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-300">
      <Loader2 size={24} className="animate-spin" />
    </div>
  )
  if (!campaign) return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
      <p className="text-sm">캠페인을 찾을 수 없습니다.</p>
      <button onClick={() => router.back()} className="text-blue-500 text-sm hover:underline">돌아가기</button>
    </div>
  )

  const index: SheetIndexItem[]  = campaign.sheetsIndex ?? []
  const activeItem               = index.find(i => i.key === activeKey)
  const activeSheet: ParsedSheet | undefined =
    activeKey && campaign.sheets ? campaign.sheets[activeKey] : undefined

  const isPerfTab = activeSheet?.type === 'timeline' || activeSheet?.type === 'engagement'
  const cols      = activeSheet ? detectCols(activeSheet.rawHeaders) : {} as ColMap
  const computed  = activeSheet && isPerfTab ? computeRows(activeSheet, cols) : []

  return (
    <div className="h-full overflow-y-auto bg-gray-50/40">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">

        {/* 뒤로가기 */}
        <button onClick={() => router.push('/campaigns')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
          <ArrowLeft size={14} />캠페인 목록
        </button>

        {/* 캠페인 헤더 */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-400 mb-1">{campaign.clientName}</p>
              <h1 className="text-xl font-bold text-gray-900">{campaign.campaignName}</h1>
            </div>
            {editingStatus ? (
              <div className="flex items-center gap-2">
                <select defaultValue={campaign.status}
                  onChange={e => changeStatus(e.target.value as CampaignStatus)}
                  disabled={savingStatus}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1 outline-none">
                  {(Object.keys(STATUS_LABELS) as CampaignStatus[]).map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <button onClick={() => setEditingStatus(false)} className="text-gray-400"><X size={15} /></button>
              </div>
            ) : (
              <button onClick={() => setEditingStatus(true)}
                className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border', STATUS_COLS[campaign.status])}>
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
          </div>
          {campaign.memo && <p className="mt-3 text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{campaign.memo}</p>}
        </div>

        {/* Sheets 연동 */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Google Sheets 연동</h2>
          <div className="flex gap-2">
            <input value={sheetsInput} onChange={e => setSheetsInput(e.target.value)}
              placeholder="Google Sheets URL을 붙여넣으세요..."
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
            <button onClick={syncSheets} disabled={syncing || !sheetsInput.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 shrink-0">
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {syncing ? '동기화 중...' : '동기화'}
            </button>
          </div>
          {syncResult && (
            <p className={clsx('text-xs mt-2 flex items-center gap-1', syncResult.ok ? 'text-green-600' : 'text-red-500')}>
              {syncResult.ok ? <Check size={11} /> : <X size={11} />}{syncResult.msg}
            </p>
          )}
          {campaign.sheetsLastSyncAt && !syncResult && (
            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
              <Check size={11} className="text-green-500" />
              마지막 동기화: {format(new Date(campaign.sheetsLastSyncAt), 'MM.dd HH:mm', { locale: ko })}
            </p>
          )}
        </div>

        {/* 탭 + 대시보드 */}
        {index.length > 0 ? (
          <>
            {/* 탭 네비 */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {index.map(item => {
                const meta = TAB_TYPE_META[item.type]
                const active = activeKey === item.key
                return (
                  <button key={item.key} onClick={() => setActiveKey(item.key)}
                    className={clsx(
                      'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap border transition-all shrink-0',
                      active
                        ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                    )}>
                    {meta.icon}
                    {item.displayName}
                    <span className={clsx('px-1.5 py-0.5 rounded-full text-xs', active ? 'bg-indigo-400' : 'bg-gray-100 text-gray-400')}>
                      {item.rowCount}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* 탭 콘텐츠 */}
            {activeSheet && (
              <div>
                {isPerfTab && computed.length > 0 ? (
                  <PerformanceDashboard
                    sheet={activeSheet}
                    rows={computed}
                    cols={cols}
                    campaignBudget={campaign.budget ?? 0}
                  />
                ) : (
                  <SimpleSheetView sheet={activeSheet} />
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 gap-3 border-2 border-dashed border-gray-200 rounded-2xl text-gray-300">
            <TrendingUp size={32} />
            <div className="text-center">
              <p className="text-sm text-gray-400 font-medium">Google Sheets를 연동하면</p>
              <p className="text-sm text-gray-400">조회수 · ER · 인플루언서 현황이 대시보드로 표시됩니다</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
