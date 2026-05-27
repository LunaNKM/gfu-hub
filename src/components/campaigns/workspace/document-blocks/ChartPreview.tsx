'use client'

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CampaignOverviewChart } from '@/types'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

export function ChartPreview({ chart }: { chart: CampaignOverviewChart }) {
  if (chart.type === 'ranking') {
    const max = chart.data[0]?.value ?? 1
    return (
      <div className="space-y-2">
        {chart.data.slice(0, 8).map((item, index) => (
          <div key={`${item.name}-${index}`} className="flex items-center gap-2 text-xs">
            <span className="w-4 text-right text-gray-400">{index + 1}</span>
            <span className="flex-1 truncate text-gray-700">{item.name}</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${max > 0 ? (item.value / max) * 100 : 0}%` }}
              />
            </div>
            <span className="w-14 text-right text-gray-500">{item.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    )
  }

  if (chart.type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={chart.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={64}>
            {chart.data.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={chart.data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {chart.data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
