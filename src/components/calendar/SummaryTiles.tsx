'use client'

import React from 'react'
import { AdCampaign } from '@/types'
import {
  AdCurrency,
  CURRENCY_META,
  campaignBudget,
  campaignLines,
  dailyBudgetOn,
  formatMoney,
  toDateString,
} from '@/lib/adCalendar/format'

interface SummaryTilesProps {
  month: Date
  campaigns: AdCampaign[]
  currency: AdCurrency
  mediaFilter: Set<string>
  selectedDate: string
}

interface TileProps {
  label: string
  value: string
  sub: string
}

function Tile({ label, value, sub }: TileProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1.5 text-xl font-bold tracking-tight tabular-nums text-gray-900">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] tabular-nums text-gray-400">{sub}</div>
    </div>
  )
}

export function SummaryTiles({
  month,
  campaigns,
  currency,
  mediaFilter,
  selectedDate,
}: SummaryTilesProps) {
  const other: AdCurrency = currency === 'JPY' ? 'KRW' : 'JPY'
  const budget = campaigns.reduce((sum, c) => sum + campaignBudget(c, currency, mediaFilter), 0)
  const otherBudget = campaigns.reduce((sum, c) => sum + campaignBudget(c, other, mediaFilter), 0)
  const brandCount = new Set(campaigns.map((c) => c.brandId)).size
  const lineCount = campaigns.reduce((sum, c) => sum + campaignLines(c, mediaFilter).length, 0)

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  let peakValue = 0
  let peakLabel = '-'
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateString = toDateString(new Date(month.getFullYear(), month.getMonth(), day))
    const total = dailyBudgetOn(campaigns, dateString, currency, mediaFilter)
    if (total > peakValue) {
      peakValue = total
      peakLabel = `${month.getMonth() + 1}/${day}`
    }
  }

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="이 달 캠페인"
        value={`${campaigns.length}건`}
        sub={`브랜드 ${brandCount}개 · 광고 라인 ${lineCount}개`}
      />
      <Tile
        label={`월 매체비 · 마크업 제외 (${CURRENCY_META[currency].label})`}
        value={formatMoney(budget, currency)}
        sub={formatMoney(otherBudget, other)}
      />
      <Tile
        label={`${selectedDate.slice(5).replace('-', '/')} 설정 일예산`}
        value={formatMoney(dailyBudgetOn(campaigns, selectedDate, currency, mediaFilter), currency)}
        sub="그날 켜져 있어야 하는 합계"
      />
      <Tile
        label="피크 일예산"
        value={formatMoney(peakValue, currency)}
        sub={`${peakLabel} 기준 최대`}
      />
    </div>
  )
}

export default SummaryTiles
