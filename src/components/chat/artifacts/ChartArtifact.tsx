'use client'

import React from 'react'
import {
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']

interface SeriesItem {
  key: string
  name?: string
  color?: string
}

interface ChartData {
  title?: string
  type?: 'bar' | 'line' | 'area' | 'pie'
  data: Record<string, unknown>[]
  xKey?: string
  series?: SeriesItem[]
  // 단일 시리즈 단축 표기
  yKey?: string
}

export function ChartArtifact({ raw }: { raw: string }) {
  let parsed: ChartData
  try {
    parsed = JSON.parse(raw)
  } catch {
    return <p className="text-xs text-red-500 p-2">차트 데이터 파싱 실패</p>
  }

  const { title, type = 'bar', data, xKey = 'name', series, yKey } = parsed

  // series가 없으면 yKey로 단일 시리즈 생성
  const resolvedSeries: SeriesItem[] = series?.length
    ? series
    : yKey
      ? [{ key: yKey, name: yKey, color: COLORS[0] }]
      : Object.keys(data[0] ?? {})
          .filter((k) => k !== xKey && typeof data[0][k] === 'number')
          .map((k, i) => ({ key: k, name: k, color: COLORS[i % COLORS.length] }))

  const commonProps = {
    data,
    margin: { top: 8, right: 16, left: 0, bottom: 4 },
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden my-3">
      {title && (
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-700">{title}</p>
        </div>
      )}
      <div className="p-3">
        <ResponsiveContainer width="100%" height={220}>
          {type === 'pie' ? (
            <PieChart>
              <Pie
                data={data}
                dataKey={resolvedSeries[0]?.key ?? 'value'}
                nameKey={xKey}
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : type === 'line' ? (
            <LineChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip />
              {resolvedSeries.length > 1 && <Legend />}
              {resolvedSeries.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.name ?? s.key}
                  stroke={s.color ?? COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          ) : type === 'area' ? (
            <AreaChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip />
              {resolvedSeries.length > 1 && <Legend />}
              {resolvedSeries.map((s, i) => (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.name ?? s.key}
                  stroke={s.color ?? COLORS[i]} fill={`${s.color ?? COLORS[i]}33`} strokeWidth={2} />
              ))}
            </AreaChart>
          ) : (
            <BarChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip />
              {resolvedSeries.length > 1 && <Legend />}
              {resolvedSeries.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.name ?? s.key}
                  fill={s.color ?? COLORS[i]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
