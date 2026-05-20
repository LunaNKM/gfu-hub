'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts'
import {
  DollarSign, MousePointer, Eye, TrendingUp, Target,
  ChevronDown, AlertCircle, RefreshCw, Users, Layout,
  Play, Activity, Clock,
} from 'lucide-react'
import { clsx } from 'clsx'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

// ── Types ──────────────────────────────────────────────────────
interface AdAccount { id: string; name: string; account_status: number; currency: string }

interface CampaignInsight {
  campaign_id: string; campaign_name: string; impressions: string; clicks: string
  spend: string; ctr: string; cpc: string; reach: string; frequency: string
  quality_ranking?: string; engagement_rate_ranking?: string; conversion_rate_ranking?: string
}

interface DailyTrend {
  date_start: string; spend: string; impressions: string; clicks: string
  frequency?: string; ctr?: string
}

interface AgeGenderRow {
  age: string; gender: string; impressions: string; clicks: string
  spend: string; ctr: string; cpc: string
}

interface PlacementRow {
  publisher_platform: string; platform_position: string; impressions: string
  clicks: string; spend: string; ctr: string; cpc: string; cpm: string
}

interface VideoAction { action_type: string; value: string }
interface VideoRow {
  campaign_id: string; campaign_name: string; impressions: string
  video_3s_watched_actions?: VideoAction[]
  video_p25_watched_actions?: VideoAction[]
  video_p50_watched_actions?: VideoAction[]
  video_p75_watched_actions?: VideoAction[]
  video_p100_watched_actions?: VideoAction[]
}

interface HourlyRow {
  hourly_stats_aggregated_by_advertiser_time_zone: string
  impressions: string; clicks: string; ctr: string; spend: string
}

interface InsightsData {
  campaigns: CampaignInsight[]; trend: DailyTrend[]
  ageGender: AgeGenderRow[]; placement: PlacementRow[]
  video: VideoRow[]; hourly: HourlyRow[]
}

// ── Constants ──────────────────────────────────────────────────
const DATE_PRESETS = [
  { value: 'last_7d', label: '7일' },
  { value: 'last_14d', label: '14일' },
  { value: 'last_30d', label: '30일' },
  { value: 'last_90d', label: '90일' },
]

const TABS = [
  { id: 'overview',   label: '개요',     Icon: TrendingUp },
  { id: 'audience',   label: '오디언스', Icon: Users },
  { id: 'placement',  label: '게재위치', Icon: Layout },
  { id: 'video',      label: '영상',     Icon: Play },
  { id: 'fatigue',    label: '피로도',   Icon: Activity },
  { id: 'hourly',     label: '시간대',   Icon: Clock },
] as const
type TabId = typeof TABS[number]['id']

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram',
  messenger: 'Messenger', audience_network: 'Audience Network',
}
const POSITION_LABELS: Record<string, string> = {
  feed: 'Feed', story: 'Story', reel: 'Reels', right_hand_column: 'Right Column',
  instant_article: 'Instant Article', marketplace: 'Marketplace',
  video_feeds: 'Video Feed', search: 'Search', instream_video: 'Instream Video',
}
const QUALITY_MAP: Record<string, { label: string; color: string }> = {
  ABOVE_AVERAGE:    { label: '상위', color: 'bg-green-100 text-green-700' },
  AVERAGE:          { label: '평균', color: 'bg-gray-100 text-gray-600' },
  BELOW_AVERAGE_10: { label: '하위10%', color: 'bg-red-100 text-red-600' },
  BELOW_AVERAGE_20: { label: '하위20%', color: 'bg-orange-100 text-orange-600' },
  BELOW_AVERAGE_35: { label: '하위35%', color: 'bg-red-100 text-red-600' },
  UNKNOWN:          { label: '', color: '' },
}

// ── Helpers ────────────────────────────────────────────────────
function formatCurrency(amount: number, currency = 'JPY') {
  if (currency === 'JPY') return `¥${Math.round(amount).toLocaleString()}`
  if (currency === 'KRW') return `₩${Math.round(amount).toLocaleString()}`
  if (currency === 'USD') return `$${amount.toFixed(2)}`
  return `${Math.round(amount).toLocaleString()} ${currency}`
}

function shortNum(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`
  return n.toLocaleString()
}

function extractVideoVal(actions: VideoAction[] | undefined): number {
  if (!actions) return 0
  return parseInt(actions.find(a => a.action_type === 'video_view')?.value ?? '0')
}

// 0~1 정규화 후 heatmap 색상 — #f8fafc(거의흰색) → #0f2d6e(진한네이비) 직접 보간
function heatColor(value: number, min: number, max: number, invert = false): string {
  if (max === min) return '#f8fafc'
  let t = (value - min) / (max - min)
  if (invert) t = 1 - t
  // #f8fafc(248,250,252) → #0f2d6e(15,45,110)
  const r = Math.round(248 - 233 * t)
  const g = Math.round(250 - 205 * t)
  const b = Math.round(252 - 142 * t)
  return `rgb(${r},${g},${b})`
}
function heatText(value: number, min: number, max: number, invert = false): string {
  if (max === min) return '#0f2d6e'
  let t = (value - min) / (max - min)
  if (invert) t = 1 - t
  return t > 0.35 ? '#fff' : '#0f2d6e'
}

// ── Sub-components ─────────────────────────────────────────────
function KpiCard({ icon, label, value, color = 'blue' }: {
  icon: React.ReactNode; label: string; value: string
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red'
}) {
  const bg = { blue:'bg-blue-50', green:'bg-green-50', purple:'bg-purple-50', orange:'bg-orange-50', red:'bg-red-50' }
  const fg = { blue:'text-blue-500', green:'text-green-500', purple:'text-purple-500', orange:'text-orange-500', red:'text-red-500' }
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', bg[color])}>
          <span className={fg[color]}>{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </Card>
  )
}

function QualityBadge({ rank }: { rank?: string }) {
  if (!rank || rank === 'UNKNOWN') return <span className="text-xs text-gray-300">—</span>
  const q = QUALITY_MAP[rank]
  if (!q?.label) return <span className="text-xs text-gray-300">—</span>
  return <span className={clsx('px-1.5 py-0.5 rounded text-xs font-medium', q.color)}>{q.label}</span>
}

function QualityCell({ quality, engagement, conversion }: {
  quality?: string; engagement?: string; conversion?: string
}) {
  const labels: Record<string, string> = { 품질: quality ?? '', 참여: engagement ?? '', 전환: conversion ?? '' }
  return (
    <div className="flex flex-col gap-0.5 items-center">
      {Object.entries(labels).map(([key, rank]) => {
        const q = QUALITY_MAP[rank]
        if (!q) return <span key={key} className="text-xs text-gray-300">—</span>
        return q.label
          ? <span key={key} className={clsx('px-1.5 py-0.5 rounded text-xs font-medium leading-tight', q.color)}>{key} {q.label}</span>
          : <span key={key} className="text-xs text-gray-300">—</span>
      })}
    </div>
  )
}

function EmptyCard({ message = '데이터가 없습니다.' }: { message?: string }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-gray-400 text-sm">{message}</p>
    </Card>
  )
}

// ── Main Page ──────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { user } = useAuth()
  const [accounts, setAccounts] = useState<AdAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [datePreset, setDatePreset] = useState('last_30d')
  const [insights, setInsights] = useState<InsightsData | null>(null)
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokenNotSet, setTokenNotSet] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [ageMetric, setAgeMetric] = useState<'ctr' | 'cpc' | 'spend'>('ctr')
  const [placementMetric, setPlacementMetric] = useState<'cpm' | 'ctr' | 'cpc'>('cpm')

  useEffect(() => {
    if (!user) return
    user.getIdToken()
      .then(token => fetch('/api/meta/accounts', { headers: { Authorization: `Bearer ${token}` } }))
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          if (data.error.includes('META_ACCESS_TOKEN')) setTokenNotSet(true)
          else setError(data.error)
          return
        }
        setAccounts(data)
        if (data.length > 0) setSelectedAccount(data[0].id)
      })
      .catch(() => setError('광고 계정을 불러올 수 없습니다.'))
      .finally(() => setAccountsLoading(false))
  }, [user])

  const fetchInsights = useCallback(() => {
    if (!user || !selectedAccount) return
    setInsightsLoading(true)
    setError(null)
    user.getIdToken()
      .then(token =>
        fetch(`/api/meta/insights?accountId=${selectedAccount}&datePreset=${datePreset}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setInsights(data)
      })
      .catch(() => setError('인사이트 데이터를 불러올 수 없습니다.'))
      .finally(() => setInsightsLoading(false))
  }, [user, selectedAccount, datePreset])

  useEffect(() => { fetchInsights() }, [fetchInsights])

  // ── 공통 계산 ─────────────────────────────────────────────
  const currency = accounts.find(a => a.id === selectedAccount)?.currency ?? 'JPY'
  const campaigns = insights?.campaigns ?? []
  const totalSpend = campaigns.reduce((s, c) => s + parseFloat(c.spend || '0'), 0)
  const totalImpressions = campaigns.reduce((s, c) => s + parseInt(c.impressions || '0'), 0)
  const totalClicks = campaigns.reduce((s, c) => s + parseInt(c.clicks || '0'), 0)
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0
  const avgFreq = campaigns.length > 0
    ? campaigns.reduce((s, c) => s + parseFloat(c.frequency || '0'), 0) / campaigns.length : 0

  const yTickFmt = (v: number) =>
    currency === 'JPY' || currency === 'KRW'
      ? `${currency === 'JPY' ? '¥' : '₩'}${(v / 1000).toFixed(0)}k`
      : `$${v}`

  const trendData = (insights?.trend ?? []).map(d => ({
    date: format(parseISO(d.date_start), 'M/d', { locale: ko }),
    지출: parseFloat(d.spend || '0'),
    클릭: parseInt(d.clicks || '0'),
    freq: parseFloat(d.frequency || '0'),
    ctr: parseFloat(d.ctr || '0'),
  }))

  const campaignChartData = [...campaigns]
    .sort((a, b) => parseFloat(b.spend) - parseFloat(a.spend))
    .slice(0, 10)
    .map(c => ({
      name: c.campaign_name.length > 16 ? c.campaign_name.slice(0, 16) + '…' : c.campaign_name,
      지출: parseFloat(c.spend || '0'),
    }))

  // ── 오디언스 매트릭스 데이터 ───────────────────────────────
  const AGE_ORDER = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+']
  const ageGenderRows = insights?.ageGender ?? []
  const ages = AGE_ORDER.filter(a => ageGenderRows.some(r => r.age === a))
  const genders = ['male', 'female'].filter(g => ageGenderRows.some(r => r.gender === g))

  const getAgeCell = (age: string, gender: string) =>
    ageGenderRows.find(r => r.age === age && r.gender === gender)

  const ageMetricVals = ageGenderRows.map(r => {
    if (ageMetric === 'ctr') return parseFloat(r.ctr || '0')
    if (ageMetric === 'cpc') return parseFloat(r.cpc || '0')
    return parseFloat(r.spend || '0')
  }).filter(v => v > 0)
  const ageMin = Math.min(...ageMetricVals)
  const ageMax = Math.max(...ageMetricVals)

  // ── 게재위치 데이터 ────────────────────────────────────────
  const placements = (insights?.placement ?? [])
    .filter(p => parseFloat(p.spend || '0') > 0)
    .sort((a, b) => parseFloat(b.spend) - parseFloat(a.spend))
    .slice(0, 10)
    .map(p => ({
      name: `${PLATFORM_LABELS[p.publisher_platform] ?? p.publisher_platform} · ${POSITION_LABELS[p.platform_position] ?? p.platform_position}`,
      CPM: parseFloat(p.cpm || '0'),
      CTR: parseFloat(p.ctr || '0'),
      CPC: parseFloat(p.cpc || '0'),
      지출: parseFloat(p.spend || '0'),
    }))
    .sort((a, b) => a[placementMetric.toUpperCase() as 'CPM' | 'CTR' | 'CPC'] - b[placementMetric.toUpperCase() as 'CPM' | 'CTR' | 'CPC'])

  // ── 영상 퍼널 데이터 ───────────────────────────────────────
  const videoRows = (insights?.video ?? [])
    .map(v => {
      const imp = parseInt(v.impressions || '0')
      const s3 = extractVideoVal(v.video_3s_watched_actions)
      if (imp === 0 || s3 === 0) return null
      const p25 = extractVideoVal(v.video_p25_watched_actions)
      const p50 = extractVideoVal(v.video_p50_watched_actions)
      const p75 = extractVideoVal(v.video_p75_watched_actions)
      const p100 = extractVideoVal(v.video_p100_watched_actions)
      return {
        id: v.campaign_id,
        name: v.campaign_name.length > 24 ? v.campaign_name.slice(0, 24) + '…' : v.campaign_name,
        hookRate: ((s3 / imp) * 100),
        p25Rate: imp > 0 ? (p25 / imp * 100) : 0,
        p50Rate: imp > 0 ? (p50 / imp * 100) : 0,
        p75Rate: imp > 0 ? (p75 / imp * 100) : 0,
        holdRate: s3 > 0 ? (p100 / s3 * 100) : 0,
        impressions: imp,
      }
    })
    .filter(Boolean)

  // ── 피로도 곡선 데이터 ─────────────────────────────────────
  const fatigueData = trendData
    .filter(d => d.freq > 0 && d.ctr > 0)
    .map(d => ({ x: parseFloat(d.freq.toFixed(2)), y: parseFloat(d.ctr.toFixed(3)), date: d.date }))
    .sort((a, b) => a.x - b.x)

  // ── 시간대 히트맵 데이터 ───────────────────────────────────
  const hourlyData = Array.from({ length: 24 }, (_, h) => {
    const row = (insights?.hourly ?? []).find(
      r => parseInt(r.hourly_stats_aggregated_by_advertiser_time_zone) === h
    )
    return {
      hour: h,
      label: `${h.toString().padStart(2, '0')}:00`,
      ctr: parseFloat(row?.ctr || '0'),
      clicks: parseInt(row?.clicks || '0'),
      impressions: parseInt(row?.impressions || '0'),
    }
  })
  const maxHourlyCtr = Math.max(...hourlyData.map(d => d.ctr), 0)
  const maxHourlyClicks = Math.max(...hourlyData.map(d => d.clicks), 0)

  // ── 렌더링 ─────────────────────────────────────────────────
  if (accountsLoading) return <div className="flex justify-center py-24"><LoadingSpinner size="lg" /></div>

  if (tokenNotSet) return (
    <div className="p-6 max-w-lg mx-auto mt-12">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-orange-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-1">META_ACCESS_TOKEN 설정 필요</p>
            <p className="text-xs text-gray-500 mb-3">.env.local에 아래 환경변수를 추가한 뒤 서버를 재시작하세요.</p>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 select-all whitespace-pre-wrap">{'META_ACCESS_TOKEN=your_system_user_token'}</pre>
            <p className="text-xs text-gray-400 mt-3">
              Meta Business Suite → 비즈니스 설정 → 시스템 사용자 → 토큰 생성<br />
              필요 권한: <code className="bg-gray-100 px-1 rounded">ads_read</code>
            </p>
          </div>
        </div>
      </Card>
    </div>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Meta 광고 애널리틱스</h1>
          <p className="text-sm text-gray-500 mt-0.5">Meta Marketing API 연동</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {accounts.length > 1 && (
            <div className="relative">
              <select
                value={selectedAccount}
                onChange={e => setSelectedAccount(e.target.value)}
                className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
            {DATE_PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => setDatePreset(p.value)}
                className={clsx('px-3 py-1 rounded-lg text-xs font-medium transition-all',
                  datePreset === p.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >{p.label}</button>
            ))}
          </div>
          <button
            onClick={fetchInsights}
            disabled={insightsLoading}
            className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={insightsLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <Card className="p-4 mb-6 border-red-200 bg-red-50">
          <p className="text-sm text-red-600 flex items-center gap-2"><AlertCircle size={14} />{error}</p>
        </Card>
      )}

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6 overflow-x-auto">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
              activeTab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {insightsLoading ? (
        <div className="flex justify-center py-24"><LoadingSpinner size="lg" /></div>
      ) : (
        <>
          {/* ── 개요 탭 ──────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                <KpiCard icon={<DollarSign size={20} />} label="총 광고비" value={formatCurrency(totalSpend, currency)} color="green" />
                <KpiCard icon={<Eye size={20} />} label="총 노출" value={shortNum(totalImpressions)} color="blue" />
                <KpiCard icon={<MousePointer size={20} />} label="총 클릭" value={totalClicks.toLocaleString()} color="purple" />
                <KpiCard icon={<TrendingUp size={20} />} label="평균 CTR" value={`${avgCtr.toFixed(2)}%`} color="orange" />
                <KpiCard icon={<Target size={20} />} label="평균 CPC" value={formatCurrency(avgCpc, currency)} color="red" />
                <KpiCard icon={<Activity size={20} />} label="평균 빈도" value={avgFreq.toFixed(1)} color="blue" />
              </div>

              {trendData.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <Card className="p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">일별 광고비 추이</h2>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={yTickFmt} width={52} />
                        <Tooltip
                          formatter={(v) => [formatCurrency(Number(v ?? 0), currency), '광고비']}
                          labelStyle={{ fontSize: 12 }}
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                        />
                        <Line type="monotone" dataKey="지출" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>

                  {campaignChartData.length > 0 && (
                    <Card className="p-5">
                      <h2 className="text-sm font-semibold text-gray-700 mb-4">캠페인별 광고비 (상위 10)</h2>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={campaignChartData} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={yTickFmt} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} width={130} />
                          <Tooltip
                            formatter={(v) => [formatCurrency(Number(v ?? 0), currency), '광고비']}
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                          />
                          <Bar dataKey="지출" fill="#6366f1" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  )}
                </div>
              )}

              {campaigns.length > 0 ? (
                <>
                  <h2 className="text-sm font-semibold text-gray-700 mb-3">캠페인별 상세 성과</h2>
                  <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">캠페인</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">광고비</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">노출</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">CTR</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">CPC</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">빈도</th>
                          <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">품질점수</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {[...campaigns].sort((a, b) => parseFloat(b.spend) - parseFloat(a.spend)).map(c => (
                          <tr key={c.campaign_id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-xs text-gray-800 max-w-xs">
                              <span className="line-clamp-1">{c.campaign_name}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-semibold text-gray-900">
                              {formatCurrency(parseFloat(c.spend || '0'), currency)}
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-gray-600">{shortNum(parseInt(c.impressions || '0'))}</td>
                            <td className="px-4 py-3 text-right text-xs text-gray-600">{parseFloat(c.ctr || '0').toFixed(2)}%</td>
                            <td className="px-4 py-3 text-right text-xs text-gray-600">{formatCurrency(parseFloat(c.cpc || '0'), currency)}</td>
                            <td className="px-4 py-3 text-right text-xs text-gray-600">{parseFloat(c.frequency || '0').toFixed(1)}</td>
                            <td className="px-4 py-3 text-center">
                              <QualityCell
                                quality={c.quality_ranking}
                                engagement={c.engagement_rate_ranking}
                                conversion={c.conversion_rate_ranking}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <EmptyCard message="선택한 기간에 캠페인 데이터가 없습니다." />
              )}
            </>
          )}

          {/* ── 오디언스 탭 ──────────────────────────────────── */}
          {activeTab === 'audience' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700">연령 × 성별 효율 매트릭스</h2>
                  <p className="text-xs text-gray-400 mt-0.5">진할수록 해당 지표의 성과가 높음 (CPC는 낮을수록 진함)</p>
                </div>
                <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                  {(['ctr', 'cpc', 'spend'] as const).map(m => (
                    <button key={m} onClick={() => setAgeMetric(m)}
                      className={clsx('px-3 py-1 rounded-lg text-xs font-medium transition-all',
                        ageMetric === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      )}
                    >{m.toUpperCase()}</button>
                  ))}
                </div>
              </div>

              {ageGenderRows.length > 0 ? (
                <Card className="p-5 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-24">연령대</th>
                        {genders.map(g => (
                          <th key={g} className="text-center px-3 py-2 text-xs font-medium text-gray-500">
                            {g === 'male' ? '남성' : '여성'}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ages.map(age => (
                        <tr key={age}>
                          <td className="px-3 py-2 text-xs font-medium text-gray-700">{age}</td>
                          {genders.map(gender => {
                            const cell = getAgeCell(age, gender)
                            if (!cell) return <td key={gender} className="px-3 py-2 text-center text-xs text-gray-300">—</td>
                            const val = ageMetric === 'ctr' ? parseFloat(cell.ctr || '0')
                              : ageMetric === 'cpc' ? parseFloat(cell.cpc || '0')
                              : parseFloat(cell.spend || '0')
                            const bg = heatColor(val, ageMin, ageMax, ageMetric === 'cpc')
                            const fg = heatText(val, ageMin, ageMax, ageMetric === 'cpc')
                            const display = ageMetric === 'ctr' ? `${val.toFixed(2)}%`
                              : ageMetric === 'cpc' ? formatCurrency(val, currency)
                              : formatCurrency(val, currency)
                            return (
                              <td key={gender} className="px-3 py-2 text-center">
                                <div className="rounded-lg px-2 py-2 text-xs font-semibold transition-colors"
                                  style={{ backgroundColor: bg, color: fg }}>
                                  {display}
                                  <div className="text-xs font-normal opacity-70 mt-0.5">
                                    {shortNum(parseInt(cell.impressions || '0'))} 노출
                                  </div>
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ) : (
                <EmptyCard message="연령/성별 breakdown 데이터가 없습니다." />
              )}
            </>
          )}

          {/* ── 게재위치 탭 ──────────────────────────────────── */}
          {activeTab === 'placement' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700">게재위치별 성과 비교</h2>
                  <p className="text-xs text-gray-400 mt-0.5">광고비 상위 10개 위치 · CPM은 낮을수록 효율적</p>
                </div>
                <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                  {(['cpm', 'ctr', 'cpc'] as const).map(m => (
                    <button key={m} onClick={() => setPlacementMetric(m)}
                      className={clsx('px-3 py-1 rounded-lg text-xs font-medium transition-all',
                        placementMetric === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      )}
                    >{m.toUpperCase()}</button>
                  ))}
                </div>
              </div>

              {placements.length > 0 ? (
                <Card className="p-5">
                  <ResponsiveContainer width="100%" height={Math.max(280, placements.length * 40)}>
                    <BarChart
                      data={placements}
                      layout="vertical"
                      margin={{ top: 4, right: 40, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }}
                        tickFormatter={v => placementMetric === 'ctr' ? `${v}%` : placementMetric === 'cpm' ? yTickFmt(v) : yTickFmt(v)}
                      />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} width={160} />
                      <Tooltip
                        formatter={(v) => [
                          placementMetric === 'ctr' ? `${Number(v).toFixed(2)}%` : formatCurrency(Number(v ?? 0), currency),
                          placementMetric.toUpperCase(),
                        ]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      />
                      <Bar
                        dataKey={placementMetric.toUpperCase()}
                        fill="#6366f1"
                        radius={[0, 4, 4, 0]}
                        label={{ position: 'right', fontSize: 10, fill: '#6b7280',
                          formatter: (v: unknown) => {
                            const n = Number(v ?? 0)
                            return placementMetric === 'ctr' ? `${n.toFixed(2)}%` : yTickFmt(n)
                          }
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              ) : (
                <EmptyCard message="게재위치 데이터가 없습니다." />
              )}
            </>
          )}

          {/* ── 영상 퍼널 탭 ─────────────────────────────────── */}
          {activeTab === 'video' && (
            <>
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-gray-700">영상 광고 시청 퍼널</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Hook Rate(3초 시청률) = 썸네일 매력도 · Hold Rate(완주/3초) = 콘텐츠 흡입력
                </p>
              </div>

              {videoRows.length > 0 ? (
                <div className="space-y-4">
                  {videoRows.map(v => v && (
                    <Card key={v.id} className="p-5">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-sm font-medium text-gray-800 truncate flex-1 mr-4">{v.name}</p>
                        <div className="flex gap-3 shrink-0">
                          <div className="text-center">
                            <p className="text-base font-bold text-blue-600">{v.hookRate.toFixed(1)}%</p>
                            <p className="text-xs text-gray-400">Hook Rate</p>
                          </div>
                          <div className="text-center">
                            <p className="text-base font-bold text-green-600">{v.holdRate.toFixed(1)}%</p>
                            <p className="text-xs text-gray-400">Hold Rate</p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {[
                          { label: '노출 (100%)', pct: 100, color: '#e2e8f0' },
                          { label: `3초 시청 (${v.hookRate.toFixed(1)}%)`, pct: v.hookRate, color: '#3b82f6' },
                          { label: `25% 시청 (${v.p25Rate.toFixed(1)}%)`, pct: v.p25Rate, color: '#60a5fa' },
                          { label: `50% 시청 (${v.p50Rate.toFixed(1)}%)`, pct: v.p50Rate, color: '#93c5fd' },
                          { label: `75% 시청 (${v.p75Rate.toFixed(1)}%)`, pct: v.p75Rate, color: '#bfdbfe' },
                          { label: `완주 (${v.holdRate.toFixed(1)}%)`, pct: v.holdRate, color: '#10b981' },
                        ].map(bar => (
                          <div key={bar.label} className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 w-36 shrink-0">{bar.label}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(bar.pct, 100)}%`, backgroundColor: bar.color }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <EmptyCard message="영상 광고 데이터가 없습니다. 영상 소재를 사용하는 캠페인이 있는지 확인해주세요." />
              )}
            </>
          )}

          {/* ── 피로도 탭 ────────────────────────────────────── */}
          {activeTab === 'fatigue' && (
            <>
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-gray-700">소재 피로도 곡선</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  빈도(X)가 높아질수록 CTR(Y)이 하락하는 지점이 소재 교체 타이밍
                </p>
              </div>

              {fatigueData.length > 1 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="p-5">
                    <h3 className="text-xs font-semibold text-gray-600 mb-4">빈도 vs CTR (일별)</h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="x" name="빈도" type="number" domain={['auto', 'auto']}
                          tick={{ fontSize: 11, fill: '#9ca3af' }} label={{ value: '빈도', position: 'insideBottom', offset: -8, fontSize: 11, fill: '#9ca3af' }} />
                        <YAxis dataKey="y" name="CTR" type="number"
                          tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `${v}%`} />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }}
                          formatter={(v, name) => [name === 'CTR' ? `${Number(v).toFixed(3)}%` : Number(v).toFixed(2), name]}
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                        <Scatter data={fatigueData} fill="#3b82f6" opacity={0.7} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </Card>

                  <Card className="p-5">
                    <h3 className="text-xs font-semibold text-gray-600 mb-4">일별 빈도 추이</h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="freq" name="빈도" stroke="#f59e0b" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="ctr" name="CTR (%)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>

                  <Card className="p-5 lg:col-span-2">
                    <h3 className="text-xs font-semibold text-gray-600 mb-3">분석 인사이트</h3>
                    <div className="grid grid-cols-3 gap-4">
                      {(() => {
                        const avgFreqVal = fatigueData.reduce((s, d) => s + d.x, 0) / fatigueData.length
                        const maxFreqDay = fatigueData[fatigueData.length - 1]
                        const minCtrDay = [...fatigueData].sort((a, b) => a.y - b.y)[0]
                        return [
                          { label: '평균 빈도', value: avgFreqVal.toFixed(1), sub: '기간 내 평균' },
                          { label: '최고 빈도일', value: maxFreqDay ? maxFreqDay.x.toFixed(1) : '—', sub: maxFreqDay?.date ?? '' },
                          { label: '최저 CTR일', value: minCtrDay ? `${minCtrDay.y.toFixed(3)}%` : '—', sub: minCtrDay?.date ?? '' },
                        ]
                      })().map(item => (
                        <div key={item.label} className="text-center p-3 bg-gray-50 rounded-xl">
                          <p className="text-lg font-bold text-gray-900">{item.value}</p>
                          <p className="text-xs font-medium text-gray-600">{item.label}</p>
                          <p className="text-xs text-gray-400">{item.sub}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              ) : (
                <EmptyCard message="피로도 분석에 충분한 일별 데이터가 없습니다. 기간을 늘려보세요." />
              )}
            </>
          )}

          {/* ── 시간대 탭 ────────────────────────────────────── */}
          {activeTab === 'hourly' && (
            <>
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-gray-700">시간대별 성과 (광고주 시간대 기준)</h2>
                <p className="text-xs text-gray-400 mt-0.5">진한 파란색일수록 CTR이 높은 시간대</p>
              </div>

              {hourlyData.some(d => d.ctr > 0) ? (
                <div className="space-y-6">
                  {/* CTR 히트맵 그리드 */}
                  <Card className="p-5">
                    <h3 className="text-xs font-semibold text-gray-600 mb-4">CTR 히트맵</h3>
                    <div className="grid grid-cols-12 gap-1.5">
                      {hourlyData.map(d => {
                        const bg = heatColor(d.ctr, 0, maxHourlyCtr)
                        const fg = heatText(d.ctr, 0, maxHourlyCtr)
                        return (
                          <div
                            key={d.hour}
                            className="rounded-lg p-2 text-center transition-colors cursor-default"
                            style={{ backgroundColor: bg, color: fg }}
                            title={`${d.label}: CTR ${d.ctr.toFixed(3)}%`}
                          >
                            <div className="text-xs font-medium">{d.label.slice(0, 2)}시</div>
                            <div className="text-xs mt-0.5 font-semibold">{d.ctr.toFixed(2)}%</div>
                          </div>
                        )
                      })}
                    </div>
                  </Card>

                  {/* 클릭 수 바 차트 */}
                  <Card className="p-5">
                    <h3 className="text-xs font-semibold text-gray-600 mb-4">시간대별 클릭 수</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={hourlyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }}
                          tickFormatter={v => v.slice(0, 2)} />
                        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} width={40} />
                        <Tooltip
                          formatter={(v) => [Number(v).toLocaleString(), '클릭']}
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                        />
                        <Bar dataKey="clicks" radius={[3, 3, 0, 0]}>
                          {hourlyData.map(d => (
                            <Cell key={d.hour}
                              fill={d.clicks >= maxHourlyClicks * 0.8 ? '#3b82f6'
                                : d.clicks >= maxHourlyClicks * 0.5 ? '#93c5fd' : '#dbeafe'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>

                  {/* 피크 시간대 요약 */}
                  <Card className="p-5">
                    <h3 className="text-xs font-semibold text-gray-600 mb-3">피크 시간대</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[...hourlyData].sort((a, b) => b.ctr - a.ctr).slice(0, 3).map((d, i) => (
                        <div key={d.hour} className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
                          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {i + 1}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">{d.label}</p>
                            <p className="text-xs text-gray-500">CTR {d.ctr.toFixed(3)}%</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              ) : (
                <EmptyCard message="시간대별 데이터가 없습니다." />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
