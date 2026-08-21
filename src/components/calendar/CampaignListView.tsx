'use client'

import React from 'react'
import { Pencil } from 'lucide-react'
import { AdCalendarBrand, AdCampaign } from '@/types'
import {
  AdCurrency,
  CURRENCY_META,
  campaignBudget,
  campaignDaily,
  diffDays,
  formatMoney,
  parseDate,
  rangeDays,
} from '@/lib/adCalendar/format'
import { LineTable } from './LineTable'
import { ColorBy } from './CampaignBar'

interface CampaignListViewProps {
  month: Date
  brands: AdCalendarBrand[]
  campaigns: AdCampaign[]
  currency: AdCurrency
  mediaFilter: Set<string>
  colorBy: ColorBy
  onEdit: (campaign: AdCampaign) => void
}

export function CampaignListView({
  month,
  brands,
  campaigns,
  currency,
  mediaFilter,
  colorBy,
  onEdit,
}: CampaignListViewProps) {
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)

  const groups = brands
    .map((brand) => ({ brand, items: campaigns.filter((c) => c.brandId === brand.id) }))
    .filter((group) => group.items.length > 0)

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
        이 달에 진행되는 캠페인이 없습니다.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {groups.map((group) => (
        <div key={group.brand.id}>
          <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ background: group.brand.color }}
            />
            <span className="text-[13px] font-bold text-gray-900">{group.brand.name}</span>
            <span className="ml-auto text-xs font-bold tabular-nums text-gray-600">
              캠페인 {group.items.length} · 매체비{' '}
              {formatMoney(
                group.items.reduce((sum, c) => sum + campaignBudget(c, currency, mediaFilter), 0),
                currency
              )}
            </span>
          </div>

          {group.items.map((campaign) => {
            const color = colorBy === 'brand' ? group.brand.color : campaign.color
            const offset = Math.max(0, diffDays(monthStart, parseDate(campaign.startDate)))
            const end = Math.min(daysInMonth, diffDays(monthStart, parseDate(campaign.endDate)) + 1)

            return (
              <div key={campaign.id} className="border-b border-gray-200 last:border-b-0">
                <div className="flex items-center gap-2.5 px-4 py-3">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />
                  <span className="text-[13.5px] font-bold text-gray-900">{campaign.name}</span>
                  <span className="rounded border border-gray-200 px-1.5 py-px text-[11px] text-gray-500">
                    {campaign.channel}
                  </span>
                  <span className="text-[11.5px] tabular-nums text-gray-500">
                    {campaign.startDate} ~ {campaign.endDate} ·{' '}
                    {rangeDays(campaign.startDate, campaign.endDate)}일
                  </span>
                  <span className="flex-1" />
                  <span className="text-[13px] font-bold tabular-nums text-gray-900">
                    {formatMoney(campaignDaily(campaign, currency, mediaFilter), currency)}
                    <small className="ml-1 text-[10.5px] font-medium text-gray-400">
                      /일 · {CURRENCY_META[currency].label}
                    </small>
                  </span>
                  <button
                    type="button"
                    onClick={() => onEdit(campaign)}
                    className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    title="캠페인 수정"
                  >
                    <Pencil size={14} />
                  </button>
                </div>

                <div className="relative mb-2.5 ml-9 mr-4 h-1.5 rounded-full bg-gray-100">
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      left: `${(offset / daysInMonth) * 100}%`,
                      width: `${((end - offset) / daysInMonth) * 100}%`,
                      background: color,
                    }}
                  />
                </div>

                <div className="mb-3 ml-9 mr-4">
                  <LineTable
                    campaign={campaign}
                    currency={currency}
                    mediaFilter={mediaFilter}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default CampaignListView
