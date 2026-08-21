'use client'

import React from 'react'
import { clsx } from 'clsx'
import { AdCalendarBrand, AdCampaign } from '@/types'
import { buildSegments, packLanes } from '@/lib/adCalendar/layout'
import { AdCurrency, campaignBudget, formatCompact, toDateString } from '@/lib/adCalendar/format'
import { CampaignBar, ColorBy } from './CampaignBar'

interface BrandSwimlaneProps {
  month: Date
  brands: AdCalendarBrand[]
  campaigns: AdCampaign[]
  currency: AdCurrency
  mediaFilter: Set<string>
  colorBy: ColorBy
  activeCampaignId: string | null
  today: string
  onSelectCampaign: (campaignId: string) => void
}

/**
 * 브랜드가 행, 1~말일이 열인 간트 형태.
 * 브랜드가 늘어도 세로로만 자라서 달력 격자보다 잘 버틴다.
 */
export function BrandSwimlane({
  month,
  brands,
  campaigns,
  currency,
  mediaFilter,
  colorBy,
  activeCampaignId,
  today,
  onSelectCampaign,
}: BrandSwimlaneProps) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const monthStart = new Date(year, monthIndex, 1)
  const monthEnd = new Date(year, monthIndex, daysInMonth)
  const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIndex, i + 1))
  const dayColumns = { gridTemplateColumns: `repeat(${daysInMonth}, minmax(0, 1fr))` }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <div className="min-w-[940px]">
        <div
          className="grid border-b border-gray-200 bg-gray-50"
          style={{ gridTemplateColumns: `150px repeat(${daysInMonth}, minmax(0, 1fr))` }}
        >
          <div className="border-r border-gray-200 px-3 py-2 text-[11.5px] font-bold text-gray-500">
            브랜드 · {daysInMonth}일
          </div>
          {days.map((day) => {
            const isWeekend = day.getDay() === 0 || day.getDay() === 6
            const isToday = toDateString(day) === today
            return (
              <div
                key={day.getDate()}
                className={clsx(
                  'border-l border-gray-100 py-2 text-center text-[10.5px] font-semibold',
                  isToday && 'bg-blue-500 text-white',
                  !isToday && isWeekend && 'bg-gray-50 text-red-600',
                  !isToday && !isWeekend && 'text-gray-500'
                )}
              >
                {day.getDate()}
              </div>
            )
          })}
        </div>

        {brands.map((brand) => {
          const owned = campaigns.filter((c) => c.brandId === brand.id)
          const lanes = packLanes(buildSegments(owned, monthStart, monthEnd))
          const budget = owned.reduce((sum, c) => sum + campaignBudget(c, currency, mediaFilter), 0)

          return (
            <div
              key={brand.id}
              className="grid border-b border-gray-200 last:border-b-0"
              style={{ gridTemplateColumns: '150px 1fr' }}
            >
              <div className="flex flex-col justify-center gap-1 border-r border-gray-200 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[13px] font-bold text-gray-900">
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: brand.color }}
                  />
                  {brand.name}
                </div>
                <div className="text-[10.5px] tabular-nums text-gray-400">
                  {owned.length
                    ? `캠페인 ${owned.length} · ${formatCompact(budget, currency)}`
                    : '캠페인 없음'}
                </div>
              </div>

              <div className="relative flex flex-col gap-1 py-2">
                <div className="pointer-events-none absolute inset-0 grid" style={dayColumns}>
                  {days.map((day) => (
                    <i
                      key={day.getDate()}
                      className={clsx(
                        'border-l border-gray-100',
                        (day.getDay() === 0 || day.getDay() === 6) && 'bg-gray-50'
                      )}
                    />
                  ))}
                </div>

                {lanes.length === 0 && (
                  <div className="px-3 py-2 text-[11.5px] text-gray-300">이 달 집행 없음</div>
                )}
                {lanes.map((lane, laneIndex) => (
                  <div key={laneIndex} className="relative z-10 grid" style={dayColumns}>
                    {lane.map((segment) => (
                      <CampaignBar
                        key={segment.campaign.id}
                        segment={segment}
                        brand={brand}
                        colorBy={colorBy}
                        currency={currency}
                        mediaFilter={mediaFilter}
                        showBrandShort={false}
                        showAmount={segment.span >= 4}
                        dimmed={
                          Boolean(activeCampaignId) && activeCampaignId !== segment.campaign.id
                        }
                        active={activeCampaignId === segment.campaign.id}
                        onClick={onSelectCampaign}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default BrandSwimlane
