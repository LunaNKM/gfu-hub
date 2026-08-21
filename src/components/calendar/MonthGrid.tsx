'use client'

import React from 'react'
import { clsx } from 'clsx'
import { AdCalendarBrand, AdCampaign } from '@/types'
import { buildMonthWeeks, buildSegments, packLanes } from '@/lib/adCalendar/layout'
import {
  AdCurrency,
  dailyBudgetOn,
  formatCompact,
  toDateString,
} from '@/lib/adCalendar/format'
import { CampaignBar, ColorBy } from './CampaignBar'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

interface MonthGridProps {
  month: Date
  campaigns: AdCampaign[]
  brandMap: Map<string, AdCalendarBrand>
  currency: AdCurrency
  mediaFilter: Set<string>
  colorBy: ColorBy
  showBrandShort: boolean
  selectedDate: string
  activeCampaignId: string | null
  today: string
  onSelectDate: (date: string) => void
  onSelectCampaign: (campaignId: string) => void
}

export function MonthGrid({
  month,
  campaigns,
  brandMap,
  currency,
  mediaFilter,
  colorBy,
  showBrandShort,
  selectedDate,
  activeCampaignId,
  today,
  onSelectDate,
  onSelectCampaign,
}: MonthGridProps) {
  const weeks = buildMonthWeeks(month)

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {WEEKDAYS.map((label, index) => (
          <div
            key={label}
            className={clsx(
              'py-2 text-center text-xs font-semibold',
              index === 5 && 'text-blue-600',
              index === 6 && 'text-red-600',
              index < 5 && 'text-gray-500'
            )}
          >
            {label}
          </div>
        ))}
      </div>

      {weeks.map((week) => {
        const lanes = packLanes(buildSegments(campaigns, week[0], week[6]))
        return (
          <div key={toDateString(week[0])} className="border-b border-gray-200 last:border-b-0">
            <div className="grid grid-cols-7">
              {week.map((day, index) => {
                const dateString = toDateString(day)
                const outside = day.getMonth() !== month.getMonth()
                const total = dailyBudgetOn(campaigns, dateString, currency, mediaFilter)

                return (
                  <button
                    key={dateString}
                    type="button"
                    onClick={() => onSelectDate(dateString)}
                    className={clsx(
                      'flex min-h-[46px] flex-col items-start gap-0.5 border-r border-gray-100 px-2 pb-1 pt-1.5 text-left last:border-r-0 hover:bg-gray-50',
                      dateString === selectedDate && 'bg-blue-50 hover:bg-blue-50'
                    )}
                  >
                    <span
                      className={clsx(
                        'text-[13px] font-semibold leading-none',
                        dateString === today &&
                          'flex h-[22px] w-[22px] items-center justify-center rounded-full bg-blue-500 text-xs text-white',
                        dateString !== today && outside && 'text-gray-300',
                        dateString !== today && !outside && index === 5 && 'text-blue-600',
                        dateString !== today && !outside && index === 6 && 'text-red-600',
                        dateString !== today && !outside && index < 5 && 'text-gray-700'
                      )}
                    >
                      {day.getDate()}
                    </span>
                    {total > 0 && (
                      <span
                        className={clsx(
                          'text-[10.5px] tabular-nums text-gray-400',
                          outside && 'opacity-50'
                        )}
                      >
                        일 <b className="font-semibold text-gray-600">{formatCompact(total, currency)}</b>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-col gap-[3px] px-[3px] pb-2">
              {lanes.map((lane, laneIndex) => (
                <div key={laneIndex} className="grid grid-cols-7">
                  {lane.map((segment) => (
                    <CampaignBar
                      key={segment.campaign.id}
                      segment={segment}
                      brand={brandMap.get(segment.campaign.brandId)}
                      colorBy={colorBy}
                      currency={currency}
                      mediaFilter={mediaFilter}
                      showBrandShort={showBrandShort}
                      showAmount={segment.span >= 3}
                      dimmed={Boolean(activeCampaignId) && activeCampaignId !== segment.campaign.id}
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
  )
}

export default MonthGrid
