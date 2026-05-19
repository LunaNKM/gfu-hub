'use client'

import React from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { clsx } from 'clsx'

interface MetricItem {
  label: string
  value: string
  sub?: string
  trend?: 'up' | 'down' | 'neutral'
}

interface MetricsData {
  title?: string
  items: MetricItem[]
}

export function MetricsArtifact({ raw }: { raw: string }) {
  let parsed: MetricsData
  try {
    parsed = JSON.parse(raw)
  } catch {
    return <p className="text-xs text-red-500 p-2">대시보드 데이터 파싱 실패</p>
  }

  const { title, items } = parsed

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden my-3">
      {title && (
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-700">{title}</p>
        </div>
      )}
      <div className={clsx(
        'grid gap-px bg-gray-100',
        items.length <= 2 ? 'grid-cols-2' :
        items.length === 3 ? 'grid-cols-3' :
        'grid-cols-2 sm:grid-cols-4'
      )}>
        {items.map((item, i) => (
          <div key={i} className="bg-white p-4">
            <p className="text-xs text-gray-500 mb-1 truncate">{item.label}</p>
            <p className="text-lg font-bold text-gray-900 leading-tight">{item.value}</p>
            {(item.sub || item.trend) && (
              <div className="flex items-center gap-1 mt-1">
                {item.trend === 'up' && <TrendingUp size={11} className="text-green-500 shrink-0" />}
                {item.trend === 'down' && <TrendingDown size={11} className="text-red-500 shrink-0" />}
                {item.trend === 'neutral' && <Minus size={11} className="text-gray-400 shrink-0" />}
                {item.sub && (
                  <p className={clsx(
                    'text-xs truncate',
                    item.trend === 'up' ? 'text-green-600' :
                    item.trend === 'down' ? 'text-red-600' : 'text-gray-400'
                  )}>
                    {item.sub}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
