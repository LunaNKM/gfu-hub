'use client'

import React from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, FunnelChart, Funnel, LabelList,
} from 'recharts'
import {
  CampaignDashboardWidget,
  CampaignDataTableContent,
  CampaignSection,
} from '@/types'
import { buildChartData, aggregateSingle, formatNumber } from './workspaceUtils'

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#f43f5e', '#ec4899']

interface Props {
  widget: CampaignDashboardWidget
  dataSections: CampaignSection[]
  onDelete: () => void
}

export function DashboardWidget({ widget, dataSections, onDelete }: Props) {
  const sourceSection = dataSections.find((s) => s.id === widget.sourceSectionId)
  const tableContent = sourceSection?.content as CampaignDataTableContent | undefined
  const columns = tableContent?.columns ?? []
  const rows = tableContent?.rows ?? []

  const hasMetricSource = !!sourceSection && !!widget.metricColumnId
  const hasChartSource = hasMetricSource && !!widget.dimensionColumnId

  const chartData = hasChartSource
    ? buildChartData(rows, columns, widget.dimensionColumnId, widget.metricColumnId, widget.aggregation)
    : []

  const kpiValue = hasMetricSource && widget.type === 'kpi'
    ? aggregateSingle(rows, widget.metricColumnId!, widget.aggregation)
    : null

  const placeholder = (
    <div className="flex items-center justify-center h-32 text-xs text-gray-400 text-center px-4">
      차트를 만들려면 데이터 소스와 컬럼을 선택하세요
    </div>
  )

  function renderChart() {
    if (widget.type === 'kpi') {
      if (!hasMetricSource) return placeholder
      return (
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">{kpiValue !== null ? formatNumber(kpiValue) : '—'}</p>
            <p className="text-xs text-gray-400 mt-1">{widget.aggregation.toUpperCase()}</p>
          </div>
        </div>
      )
    }

    if (!hasChartSource || chartData.length === 0) return placeholder

    if (widget.type === 'bar') {
      return (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: unknown) => formatNumber(Number(v))} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )
    }

    if (widget.type === 'line') {
      return (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: unknown) => formatNumber(Number(v))} />
            <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      )
    }

    if (widget.type === 'pie') {
      return (
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60}>
              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: unknown) => formatNumber(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      )
    }

    if (widget.type === 'funnel') {
      const funnelData = chartData.map((d, i) => ({ ...d, fill: CHART_COLORS[i % CHART_COLORS.length] }))
      return (
        <ResponsiveContainer width="100%" height={160}>
          <FunnelChart>
            <Funnel dataKey="value" data={funnelData} isAnimationActive>
              <LabelList position="right" fill="#555" stroke="none" dataKey="name" style={{ fontSize: 10 }} />
            </Funnel>
            <Tooltip formatter={(v: unknown) => formatNumber(Number(v))} />
          </FunnelChart>
        </ResponsiveContainer>
      )
    }

    if (widget.type === 'ranking') {
      const sorted = [...chartData].sort((a, b) => b.value - a.value).slice(0, 8)
      return (
        <div className="space-y-1.5 py-2">
          {sorted.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2">
              <span className="w-5 text-xs text-gray-400 font-mono shrink-0">{i + 1}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${sorted[0].value > 0 ? (d.value / sorted[0].value) * 100 : 0}%`,
                    backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                  }}
                />
              </div>
              <span className="text-xs text-gray-700 font-medium shrink-0 w-16 text-right">
                {formatNumber(d.value)}
              </span>
              <span className="text-xs text-gray-400 truncate max-w-24">{d.name}</span>
            </div>
          ))}
        </div>
      )
    }

    return placeholder
  }

  return (
    <div className="bg-white border border-gray-200 rounded p-3 relative group">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-800">{widget.title || '위젯'}</p>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-opacity"
        >
          ×
        </button>
      </div>
      {renderChart()}
    </div>
  )
}
