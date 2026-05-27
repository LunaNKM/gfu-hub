'use client'

import React from 'react'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { CampaignOverview, CampaignOverviewMetric, CampaignOverviewChart } from '@/types'
import { AlertCircle, TrendingUp, Users, BarChart2 } from 'lucide-react'

// ── 팔레트 ────────────────────────────────────────────────────────

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

// ── KPI 카드 ──────────────────────────────────────────────────────

function MetricCard({ metric }: { metric: CampaignOverviewMetric }) {
  const isMeta = metric.id.startsWith('meta_')
  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-1"
      style={{ minWidth: 0 }}
    >
      <p className="text-xs text-gray-400 truncate">{metric.label}</p>
      <p
        className={`text-xl font-semibold leading-tight truncate ${
          isMeta ? 'text-gray-300' : 'text-gray-900'
        }`}
      >
        {String(metric.value)}
        {metric.unit && <span className="text-sm font-normal text-gray-400 ml-1">{metric.unit}</span>}
      </p>
      {metric.hint && (
        <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
          <AlertCircle size={10} className="shrink-0" />
          {metric.hint}
        </p>
      )}
    </div>
  )
}

// ── 차트 아이콘 ───────────────────────────────────────────────────

function ChartTypeIcon({ type }: { type: CampaignOverviewChart['type'] }) {
  if (type === 'pie') return <BarChart2 size={13} className="text-gray-400" />
  if (type === 'ranking') return <TrendingUp size={13} className="text-gray-400" />
  return <BarChart2 size={13} className="text-gray-400" />
}

// ── 개별 차트 ─────────────────────────────────────────────────────

function OverviewChart({ chart }: { chart: CampaignOverviewChart }) {
  if (chart.data.length === 0) return null

  if (chart.type === 'pie') {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <ChartTypeIcon type={chart.type} />
          <p className="text-xs font-medium text-gray-700">{chart.title}</p>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={chart.data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={75}
              label={({ name, percent }) =>
                `${name} ${Math.round((percent ?? 0) * 100)}%`
              }
              labelLine={false}
            >
              {chart.data.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(val) => [val, '수']} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    )
  }

  if (chart.type === 'ranking') {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <ChartTypeIcon type={chart.type} />
          <p className="text-xs font-medium text-gray-700">{chart.title}</p>
        </div>
        <div className="space-y-1.5">
          {chart.data.slice(0, 8).map((item, idx) => {
            const max = chart.data[0]?.value ?? 1
            const pct = max > 0 ? (item.value / max) * 100 : 0
            return (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400 w-4 shrink-0 text-right">{idx + 1}</span>
                <span className="text-xs text-gray-700 truncate flex-1 min-w-0" title={item.name}>
                  {item.name}
                </span>
                <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden shrink-0">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: COLORS[0],
                    }}
                  />
                </div>
                <span className="text-[11px] text-gray-500 shrink-0 w-14 text-right">
                  {typeof item.value === 'number'
                    ? item.value >= 10000
                      ? `${(item.value / 10000).toFixed(1)}만`
                      : item.value.toLocaleString()
                    : item.value}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // bar (기본)
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <ChartTypeIcon type={chart.type} />
        <p className="text-xs font-medium text-gray-700">{chart.title}</p>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chart.data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) =>
              v >= 10000 ? `${(v / 10000).toFixed(0)}만` : String(v)
            }
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }}
          />
          <Bar dataKey="value" name={chart.title} radius={[3, 3, 0, 0]}>
            {chart.data.map((_, idx) => (
              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

interface Props {
  overview: CampaignOverview | null
}

export function CampaignOverviewDashboard({ overview }: Props) {
  if (!overview) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        대시보드를 불러오는 중...
      </div>
    )
  }

  const { metrics, charts } = overview
  const hasCharts = charts.length > 0

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* KPI 그리드 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-gray-400" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">KPI</p>
        </div>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
        >
          {metrics.map((m) => (
            <MetricCard key={m.id} metric={m} />
          ))}
        </div>
      </div>

      {/* 차트 */}
      {hasCharts && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={14} className="text-gray-400" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">차트</p>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {charts.map((chart) => (
              <OverviewChart key={chart.id} chart={chart} />
            ))}
          </div>
        </div>
      )}

      {!hasCharts && (
        <div className="border border-dashed border-gray-200 rounded-lg p-8 text-center text-xs text-gray-400">
          데이터베이스에 데이터를 입력하면 차트가 자동으로 생성됩니다.
        </div>
      )}
    </div>
  )
}
