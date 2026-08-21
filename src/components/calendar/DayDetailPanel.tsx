'use client'

import React from 'react'
import { Pencil } from 'lucide-react'
import { AdCalendarBrand, AdCampaign } from '@/types'
import {
  AdCurrency,
  campaignBudget,
  campaignDaily,
  formatMoney,
  parseDate,
  rangeDays,
} from '@/lib/adCalendar/format'
import { LineTable } from './LineTable'
import { ColorBy } from './CampaignBar'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

interface DayDetailPanelProps {
  selectedDate: string
  /** 캠페인 바를 눌러 한 건만 보고 있는 상태 */
  activeCampaign: AdCampaign | null
  campaigns: AdCampaign[]
  brands: AdCalendarBrand[]
  currency: AdCurrency
  mediaFilter: Set<string>
  colorBy: ColorBy
  onEdit: (campaign: AdCampaign) => void
}

export function DayDetailPanel({
  selectedDate,
  activeCampaign,
  campaigns,
  brands,
  currency,
  mediaFilter,
  colorBy,
  onEdit,
}: DayDetailPanelProps) {
  const date = parseDate(selectedDate)
  const visible = activeCampaign ? [activeCampaign] : campaigns
  const groups = brands
    .map((brand) => ({ brand, items: visible.filter((c) => c.brandId === brand.id) }))
    .filter((group) => group.items.length > 0)

  const total = visible.reduce((sum, c) => sum + campaignDaily(c, currency, mediaFilter), 0)

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 px-3.5 py-3">
        <h2 className="text-sm font-bold text-gray-900">
          {activeCampaign
            ? '캠페인 상세'
            : `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`}
        </h2>
        <span className="ml-auto text-xs text-gray-500">
          {visible.length}건 · 브랜드 {groups.length}
        </span>
      </div>

      <div className="px-3.5 py-3">
        {groups.length === 0 ? (
          <p className="py-7 text-center text-sm text-gray-400">
            이 날짜에 진행 중인 캠페인이 없습니다.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.brand.id} className="mb-3.5 last:mb-0">
              <div className="mb-2 flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ background: group.brand.color }}
                />
                <span className="text-[12.5px] font-bold text-gray-900">{group.brand.name}</span>
                <span className="ml-auto text-[12.5px] font-bold tabular-nums text-gray-900">
                  {formatMoney(
                    group.items.reduce(
                      (sum, c) => sum + campaignDaily(c, currency, mediaFilter),
                      0
                    ),
                    currency
                  )}
                </span>
              </div>

              {group.items.map((campaign) => (
                <div
                  key={campaign.id}
                  className="mb-2 overflow-hidden rounded-lg border border-gray-200 last:mb-0"
                >
                  <div className="flex items-center gap-2 border-b border-gray-200 px-2.5 py-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-sm"
                      style={{
                        background: colorBy === 'brand' ? group.brand.color : campaign.color,
                      }}
                    />
                    <span className="text-[12.5px] font-bold text-gray-900">{campaign.name}</span>
                    <span className="ml-auto text-[10.5px] tabular-nums text-gray-500">
                      {campaign.startDate.slice(5)} ~ {campaign.endDate.slice(5)} ·{' '}
                      {rangeDays(campaign.startDate, campaign.endDate)}일
                    </span>
                    <button
                      type="button"
                      onClick={() => onEdit(campaign)}
                      className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                      title="캠페인 수정"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>

                  <div className="flex gap-3.5 border-b border-gray-200 bg-gray-50 px-2.5 py-1.5">
                    <div className="text-[10.5px] text-gray-500">
                      채널
                      <b className="mt-px block text-xs font-bold text-gray-900">
                        {campaign.channel || '—'}
                      </b>
                    </div>
                    <div className="text-[10.5px] text-gray-500">
                      기간 매체비 (넷)
                      <b className="mt-px block text-xs font-bold tabular-nums text-gray-900">
                        {formatMoney(campaignBudget(campaign, currency, mediaFilter), currency)}
                      </b>
                    </div>
                    <div className="text-[10.5px] text-gray-500">
                      목표 ROAS
                      <b className="mt-px block text-xs font-bold tabular-nums text-gray-900">
                        {campaign.targetRoas ? campaign.targetRoas.toFixed(2) : '—'}
                      </b>
                    </div>
                  </div>

                  <LineTable
                    campaign={campaign}
                    currency={currency}
                    mediaFilter={mediaFilter}
                    compact
                  />

                  <div className="flex items-center border-t border-gray-200 bg-gray-50 px-2.5 py-2">
                    <span className="text-[11px] text-gray-500">캠페인 일예산</span>
                    <b className="ml-auto text-[13px] tabular-nums text-gray-900">
                      {formatMoney(campaignDaily(campaign, currency, mediaFilter), currency)}
                    </b>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {visible.length > 0 && (
        <div className="flex items-center border-t border-gray-200 bg-gray-50 px-3.5 py-2.5">
          <span className="text-[11px] text-gray-500">이 날 설정해야 하는 일예산 총합</span>
          <b className="ml-auto text-[13px] tabular-nums text-gray-900">
            {formatMoney(total, currency)}
          </b>
        </div>
      )}
    </div>
  )
}

export default DayDetailPanel
