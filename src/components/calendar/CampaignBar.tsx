'use client'

import React from 'react'
import { clsx } from 'clsx'
import { AdCalendarBrand } from '@/types'
import { BarSegment } from '@/lib/adCalendar/layout'
import {
  AdCurrency,
  campaignDaily,
  formatCompact,
  hexToRgba,
} from '@/lib/adCalendar/format'

export type ColorBy = 'brand' | 'campaign'

interface CampaignBarProps {
  segment: BarSegment
  brand?: AdCalendarBrand
  colorBy: ColorBy
  currency: AdCurrency
  mediaFilter: Set<string>
  /** 브랜드를 하나만 보고 있으면 바에 약칭을 붙이지 않는다. */
  showBrandShort: boolean
  showAmount: boolean
  dimmed: boolean
  active: boolean
  onClick: (campaignId: string) => void
}

export function CampaignBar({
  segment,
  brand,
  colorBy,
  currency,
  mediaFilter,
  showBrandShort,
  showAmount,
  dimmed,
  active,
  onClick,
}: CampaignBarProps) {
  const { campaign, column, span, continuesBefore, continuesAfter } = segment
  const color = colorBy === 'brand' ? brand?.color ?? campaign.color : campaign.color
  const daily = campaignDaily(campaign, currency, mediaFilter)

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick(campaign.id)
      }}
      title={`${brand?.name ?? ''} · ${campaign.name} · ${campaign.startDate} ~ ${campaign.endDate}`}
      style={{
        gridColumn: `${column} / span ${span}`,
        gridRow: 1,
        background: hexToRgba(color, 0.12),
        borderColor: hexToRgba(color, 0.45),
        color,
        boxShadow: active ? `0 0 0 2px #fff, 0 0 0 3.5px ${color}` : undefined,
      }}
      className={clsx(
        'mx-px flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md border px-2 py-1 text-[11.5px] font-semibold transition-opacity',
        continuesBefore && 'rounded-l-sm',
        continuesAfter && 'rounded-r-sm',
        dimmed && 'opacity-25'
      )}
    >
      {brand && (
        <span
          className="h-[7px] w-[7px] shrink-0 rounded-sm"
          style={{ background: brand.color }}
        />
      )}
      <span className="truncate">
        {continuesBefore && '↳ '}
        {showBrandShort && brand ? `${brand.short} ` : ''}
        {campaign.name}
      </span>
      {showAmount && (
        <span className="ml-auto shrink-0 tabular-nums opacity-90">
          일 {formatCompact(daily, currency)}
        </span>
      )}
    </button>
  )
}

export default CampaignBar
