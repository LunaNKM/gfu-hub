'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Campaign, CampaignStatus, InfluencerRow } from '@/types'
import {
  ArrowLeft, RefreshCw, ExternalLink, Calendar, CircleDollarSign,
  Users, Eye, Heart, MessageCircle, Share2, Loader2, Pencil, Check, X,
  TrendingUp, Bookmark, Antenna,
} from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid,
} from 'recharts'

// ── 상수 ─────────────────────────────────────────────────────────
const COLUMNS: { status: CampaignStatus; label: string }[] = [
  { status: 'proposal',  label: '제안'    },
  { status: 'active',    label: '진행 중' },
  { status: 'completed', label: '완료'    },
]

const STATUS_STYLE: Record<CampaignStatus, string> = {
  proposal:  'bg-amber-100 text-amber-700 border-amber-200',
  active:    'bg-blue-100 text-blue-700 border-blue-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
}

// 헤더명 → 한국어 레이블
const HEADER_LABELS: Record<string, string> = {
  name: '인플루언서', handle: '계정', platform: '플랫폼', status: '상태',
  followers: '팔로워', views: '조회수', likes: '좋아요', comments: '댓글',
  shares: '공유', saves: '저장', reach: '도달', impressions: '노출',
  fee: '비용(원)', postUrl: '링크', memo: '메모',
}

const STAT_FIELDS = ['views', 'likes', 'comments', 'shares', 'saves', 'reach', 'impressions']

const STAT_ICONS: Record<string, React.ReactNode> = {
  views:       <Eye size={14} />,
  likes:       <Heart size={14} />,
  comments:    <MessageCircle size={14} />,
  shares:      <Share2 size={14} />,
  saves:       <Bookmark size={14} />,
  reach:       <Antenna size={14} />,
  impressions: <TrendingUp size={14} />,
}

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe']

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

function dateRange(start: string, end: string) {
  const s = start ? format(new Date(start), 'yyyy.MM.dd', { locale: ko }) : ''
  const e = end   ? format(new Date(end),   'yyyy.MM.dd', { locale: ko }) : ''
  if (!s && !e) return '기간 미정'
  return `${s}${s && e ? ' ~ ' : ''}${e}`
}

// ── 요약 통계 카드 ────────────────────────────────────────────────
function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-gray-400 mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  )
}

// ── 인플루언서 테이블 ─────────────────────────────────────────────
function InfluencerTable({ headers, influencers }: { headers: string[]; influencers: InfluencerRow[] }) {
  const visibleHeaders = headers.filter(h => h !== 'memo')
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {visibleHeaders.map(h => (
              <th key={h} className="text-left text-xs font-medium text-gray-500 pb-2 pr-4 whitespace-nowrap">
                {HEADER_LABELS[h] ?? h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {influencers.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
              {visibleHeaders.map(h => {
                const v = row[h]
                if (h === 'postUrl' && v) {
                  return (
                    <td key={h} className="py-2 pr-4">
                      <a href={String(v)} target="_blank" rel="noopener noreferrer"
                        className="text-blue-500 hover:underline flex items-center gap-1">
                        <ExternalLink size={11} />링크
                      </a>
                    </td>
                  )
                }
                const numericFields = new Set(STAT_FIELDS.concat(['followers', 'fee']))
                const display = v === null || v === ''
                  ? <span className="text-gray-300">—</span>
                  : numericFields.has(h) && typeof v === 'number'
                    ? fmtNum(v)
                    : String(v)
                return <td key={h} className="py-2 pr-4 text-gray-700 whitespace-nowrap">{display}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── 메인 ─────────────────────────────────────────────────────────
export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const token = user?.uid ?? ''

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [sheetsInput, setSheetsInput] = useState('')
  const [editingStatus, setEditingStatus] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [activeChart, setActiveChart] = useState<string>('views')

  const load = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setCampaign(data.campaign)
      setSheetsInput(data.campaign?.sheetsUrl ?? '')
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [id, token])

  useEffect(() => { load() }, [load])

  // 시트 동기화
  const syncSheets = async () => {
    if (!sheetsInput.trim()) return
    setSyncing(true)
    setSyncError('')
    try {
      const res = await fetch(`/api/campaigns/${id}/sheets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sheetsUrl: sheetsInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await load()
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : '동기화 실패')
    } finally {
      setSyncing(false)
    }
  }

  // 상태 변경
  const changeStatus = async (newStatus: CampaignStatus) => {
    setSavingStatus(true)
    try {
      await fetch(`/api/campaigns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      })
      setCampaign(prev => prev ? { ...prev, status: newStatus } : prev)
      setEditingStatus(false)
    } finally { setSavingStatus(false) }
  }

  // 집계 통계
  const influencers = campaign?.influencers ?? []
  const headers = campaign?.sheetsHeaders ?? []

  const totalFor = (field: string) =>
    influencers.reduce((s, r) => s + (typeof r[field] === 'number' ? (r[field] as number) : 0), 0)

  const availableStats = STAT_FIELDS.filter(f => headers.includes(f) && totalFor(f) > 0)

  // 차트 데이터: 상위 10명
  const chartField = availableStats.includes(activeChart) ? activeChart : availableStats[0] ?? ''
  const chartData = chartField
    ? influencers
        .filter(r => typeof r[chartField] === 'number' && (r[chartField] as number) > 0)
        .sort((a, b) => (b[chartField] as number) - (a[chartField] as number))
        .slice(0, 10)
        .map(r => ({
          name: String(r.name ?? r.handle ?? '?').slice(0, 12),
          value: r[chartField] as number,
        }))
    : []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-300">
        <Loader2 size={24} className="animate-spin" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
        <p className="text-sm">캠페인을 찾을 수 없습니다.</p>
        <button onClick={() => router.back()} className="text-blue-500 text-sm hover:underline">돌아가기</button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

        {/* 뒤로가기 */}
        <button onClick={() => router.push('/campaigns')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
          <ArrowLeft size={15} />
          캠페인 목록
        </button>

        {/* 헤더 */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 font-medium mb-1">{campaign.clientName}</p>
              <h1 className="text-xl font-bold text-gray-900">{campaign.campaignName}</h1>
            </div>
            {/* 상태 배지 / 편집 */}
            <div className="shrink-0">
              {editingStatus ? (
                <div className="flex items-center gap-2">
                  <select
                    defaultValue={campaign.status}
                    onChange={e => changeStatus(e.target.value as CampaignStatus)}
                    disabled={savingStatus}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1 outline-none"
                  >
                    {COLUMNS.map(c => <option key={c.status} value={c.status}>{c.label}</option>)}
                  </select>
                  <button onClick={() => setEditingStatus(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingStatus(true)}
                  className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors', STATUS_STYLE[campaign.status])}
                >
                  {COLUMNS.find(c => c.status === campaign.status)?.label}
                  <Pencil size={11} />
                </button>
              )}
            </div>
          </div>

          {/* 메타 정보 */}
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <Calendar size={14} className="text-gray-400" />
              {dateRange(campaign.startDate, campaign.endDate)}
            </div>
            {campaign.budget > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <CircleDollarSign size={14} className="text-gray-400" />
                {fmtBudget(campaign.budget)}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <Users size={14} className="text-gray-400" />
              인플루언서 {influencers.length}명
            </div>
          </div>

          {campaign.memo && (
            <p className="mt-3 text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{campaign.memo}</p>
          )}
        </div>

        {/* Google Sheets 연동 */}
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
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors shrink-0"
            >
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {syncing ? '동기화 중...' : '동기화'}
            </button>
          </div>
          {syncError && <p className="text-xs text-red-500 mt-2">{syncError}</p>}
          {campaign.sheetsLastSyncAt && (
            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
              <Check size={11} className="text-green-500" />
              마지막 동기화: {format(new Date(campaign.sheetsLastSyncAt), 'MM.dd HH:mm', { locale: ko })}
            </p>
          )}
        </div>

        {/* 성과 통계 요약 */}
        {availableStats.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-800 mb-3">성과 요약</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {availableStats.map(field => (
                <StatCard
                  key={field}
                  icon={STAT_ICONS[field]}
                  label={HEADER_LABELS[field] ?? field}
                  value={fmtNum(totalFor(field))}
                />
              ))}
            </div>
          </div>
        )}

        {/* 차트 */}
        {chartData.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-gray-800">인플루언서별 성과 (상위 10)</h2>
              <div className="flex gap-1 flex-wrap">
                {availableStats.map(field => (
                  <button
                    key={field}
                    onClick={() => setActiveChart(field)}
                    className={clsx(
                      'px-2.5 py-1 text-xs rounded-full border transition-colors',
                      activeChart === field
                        ? 'bg-indigo-500 text-white border-indigo-500'
                        : 'border-gray-200 text-gray-500 hover:border-indigo-300'
                    )}
                  >
                    {HEADER_LABELS[field] ?? field}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => fmtNum(Number(v))} tick={{ fontSize: 11 }} width={50} />
                <Tooltip formatter={(v: unknown) => fmtNum(Number(v))} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 인플루언서 테이블 */}
        {influencers.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">
              인플루언서 목록
              <span className="ml-2 text-xs font-normal text-gray-400">{influencers.length}명</span>
            </h2>
            <InfluencerTable headers={headers} influencers={influencers} />
          </div>
        )}

        {/* 시트 미연동 상태 */}
        {influencers.length === 0 && !campaign.sheetsUrl && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3 border-2 border-dashed border-gray-200 rounded-2xl">
            <Users size={32} />
            <p className="text-sm text-gray-400">Google Sheets URL을 입력하면 인플루언서 데이터가 자동으로 불러와집니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}
