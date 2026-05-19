'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  DollarSign, MousePointer, Eye, TrendingUp, Target,
  ChevronDown, AlertCircle, RefreshCw,
} from 'lucide-react'
import { clsx } from 'clsx'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

// ── Types ─────────────────────────────────────────────────────
interface AdAccount {
  id: string
  name: string
  account_status: number
  currency: string
}

interface CampaignInsight {
  campaign_id: string
  campaign_name: string
  impressions: string
  clicks: string
  spend: string
  ctr: string
  cpc: string
  reach: string
  frequency: string
}

interface DailyTrend {
  date_start: string
  spend: string
  impressions: string
  clicks: string
}

interface InsightsData {
  campaigns: CampaignInsight[]
  trend: DailyTrend[]
}

// ── Constants ─────────────────────────────────────────────────
const DATE_PRESETS = [
  { value: 'last_7d', label: '7일' },
  { value: 'last_14d', label: '14일' },
  { value: 'last_30d', label: '30일' },
  { value: 'last_90d', label: '90일' },
]

// ── Helpers ───────────────────────────────────────────────────
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

// ── KPI Card ─────────────────────────────────────────────────
function KpiCard({
  icon, label, value, color = 'blue',
}: {
  icon: React.ReactNode
  label: string
  value: string
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red'
}) {
  const bg = { blue: 'bg-blue-50', green: 'bg-green-50', purple: 'bg-purple-50', orange: 'bg-orange-50', red: 'bg-red-50' }
  const fg = { blue: 'text-blue-500', green: 'text-green-500', purple: 'text-purple-500', orange: 'text-orange-500', red: 'text-red-500' }
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

// ── Main Page ─────────────────────────────────────────────────
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

  // 광고 계정 목록 로드
  useEffect(() => {
    if (!user) return
    user.getIdToken()
      .then((token) => fetch('/api/meta/accounts', { headers: { Authorization: `Bearer ${token}` } }))
      .then((r) => r.json())
      .then((data) => {
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

  // 인사이트 데이터 로드
  const fetchInsights = useCallback(() => {
    if (!user || !selectedAccount) return
    setInsightsLoading(true)
    setError(null)
    user.getIdToken()
      .then((token) =>
        fetch(`/api/meta/insights?accountId=${selectedAccount}&datePreset=${datePreset}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return }
        setInsights(data)
      })
      .catch(() => setError('인사이트 데이터를 불러올 수 없습니다.'))
      .finally(() => setInsightsLoading(false))
  }, [user, selectedAccount, datePreset])

  useEffect(() => { fetchInsights() }, [fetchInsights])

  // ── KPI 계산 ───────────────────────────────────────────────
  const currency = accounts.find((a) => a.id === selectedAccount)?.currency ?? 'JPY'
  const campaigns = insights?.campaigns ?? []
  const totalSpend = campaigns.reduce((s, c) => s + parseFloat(c.spend || '0'), 0)
  const totalImpressions = campaigns.reduce((s, c) => s + parseInt(c.impressions || '0'), 0)
  const totalClicks = campaigns.reduce((s, c) => s + parseInt(c.clicks || '0'), 0)
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0

  // ── 차트 데이터 ────────────────────────────────────────────
  const trendData = (insights?.trend ?? []).map((d) => ({
    date: format(parseISO(d.date_start), 'M/d', { locale: ko }),
    지출: parseFloat(d.spend || '0'),
    클릭: parseInt(d.clicks || '0'),
  }))

  const campaignChartData = [...campaigns]
    .sort((a, b) => parseFloat(b.spend) - parseFloat(a.spend))
    .slice(0, 10)
    .map((c) => ({
      name: c.campaign_name.length > 18 ? c.campaign_name.slice(0, 18) + '…' : c.campaign_name,
      지출: parseFloat(c.spend || '0'),
    }))

  const yTickFormatter = (v: number) =>
    currency === 'JPY' || currency === 'KRW'
      ? `${currency === 'JPY' ? '¥' : '₩'}${(v / 1000).toFixed(0)}k`
      : `$${v}`

  // ── Render: 로딩 ───────────────────────────────────────────
  if (accountsLoading) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // ── Render: 토큰 미설정 안내 ───────────────────────────────
  if (tokenNotSet) {
    return (
      <div className="p-6 max-w-lg mx-auto mt-12">
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-gray-800 mb-1">META_ACCESS_TOKEN 설정 필요</p>
              <p className="text-xs text-gray-500 mb-3">
                .env.local에 아래 환경변수를 추가한 뒤 서버를 재시작하세요.
              </p>
              <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 select-all whitespace-pre-wrap">
                {'META_ACCESS_TOKEN=your_system_user_token'}
              </pre>
              <p className="text-xs text-gray-400 mt-3">
                Meta Business Suite → 비즈니스 설정 → 시스템 사용자 → 토큰 생성
                <br />필요 권한: <code className="bg-gray-100 px-1 rounded">ads_read</code>
              </p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  // ── Render: 메인 대시보드 ──────────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Meta 광고 애널리틱스</h1>
          <p className="text-sm text-gray-500 mt-0.5">Meta Marketing API 연동</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 계정 선택 */}
          {accounts.length > 1 && (
            <div className="relative">
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}

          {/* 기간 선택 */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setDatePreset(p.value)}
                className={clsx(
                  'px-3 py-1 rounded-lg text-xs font-medium transition-all',
                  datePreset === p.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* 새로고침 */}
          <button
            onClick={fetchInsights}
            disabled={insightsLoading}
            className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={insightsLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <Card className="p-4 mb-6 border-red-200 bg-red-50">
          <p className="text-sm text-red-600 flex items-center gap-2">
            <AlertCircle size={14} />
            {error}
          </p>
        </Card>
      )}

      {insightsLoading ? (
        <div className="flex justify-center py-24">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <>
          {/* KPI 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
            <KpiCard icon={<DollarSign size={20} />} label="총 광고비" value={formatCurrency(totalSpend, currency)} color="green" />
            <KpiCard icon={<Eye size={20} />} label="총 노출" value={shortNum(totalImpressions)} color="blue" />
            <KpiCard icon={<MousePointer size={20} />} label="총 클릭" value={totalClicks.toLocaleString()} color="purple" />
            <KpiCard icon={<TrendingUp size={20} />} label="평균 CTR" value={`${avgCtr.toFixed(2)}%`} color="orange" />
            <KpiCard icon={<Target size={20} />} label="평균 CPC" value={formatCurrency(avgCpc, currency)} color="red" />
          </div>

          {/* 차트 */}
          {trendData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* 일별 광고비 추이 */}
              <Card className="p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">일별 광고비 추이</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={yTickFormatter} width={52} />
                    <Tooltip
                      formatter={(v) => [formatCurrency(Number(v ?? 0), currency), '광고비']}
                      labelStyle={{ fontSize: 12 }}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    />
                    <Line type="monotone" dataKey="지출" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              {/* 캠페인별 광고비 */}
              {campaignChartData.length > 0 && (
                <Card className="p-5">
                  <h2 className="text-sm font-semibold text-gray-700 mb-4">캠페인별 광고비 (상위 10)</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={campaignChartData} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={yTickFormatter} />
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

          {/* 캠페인 테이블 */}
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
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">클릭</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">CTR</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">CPC</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">도달</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[...campaigns]
                      .sort((a, b) => parseFloat(b.spend) - parseFloat(a.spend))
                      .map((c) => (
                        <tr key={c.campaign_id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-xs text-gray-800 max-w-xs">
                            <span className="line-clamp-1">{c.campaign_name}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-semibold text-gray-900">
                            {formatCurrency(parseFloat(c.spend || '0'), currency)}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-600">
                            {shortNum(parseInt(c.impressions || '0'))}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-600">
                            {parseInt(c.clicks || '0').toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-600">
                            {parseFloat(c.ctr || '0').toFixed(2)}%
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-600">
                            {formatCurrency(parseFloat(c.cpc || '0'), currency)}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-600">
                            {shortNum(parseInt(c.reach || '0'))}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-gray-400 text-sm">선택한 기간에 캠페인 데이터가 없습니다.</p>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
