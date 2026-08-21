'use client'

import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { AdCampaign } from '@/types'
import {
  AdCurrency,
  CURRENCY_META,
  campaignLines,
  formatMoney,
  isLineDaysMismatched,
  lineBudget,
  lineDaily,
  lineRange,
  mediaBadgeClass,
  rangeDays,
} from '@/lib/adCalendar/format'

interface LineTableProps {
  campaign: AdCampaign
  currency: AdCurrency
  mediaFilter: Set<string>
  /** 사이드 패널처럼 좁은 자리에서는 글씨를 줄인다. */
  compact?: boolean
}

/** 캠페인의 매체 × 목표 라인 표. 일예산은 넷 기준이고 산정 근거를 함께 보여 준다. */
export function LineTable({ campaign, currency, mediaFilter, compact }: LineTableProps) {
  const lines = campaignLines(campaign, mediaFilter)

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className="w-16 border-b border-gray-100 px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-500">
            매체
          </th>
          <th className="border-b border-gray-100 px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-500">
            목표 / 타겟
          </th>
          <th
            className={`${compact ? 'w-[118px]' : 'w-[150px]'} border-b border-gray-100 px-2.5 py-1.5 text-right text-[10px] font-semibold text-gray-500`}
          >
            일예산 ({CURRENCY_META[currency].label})
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line, index) => {
          const mismatched = isLineDaysMismatched(campaign, line)
          const [start, end] = lineRange(campaign, line)
          const hasOwnRange = Boolean(line.startDate || line.endDate)

          return (
            <tr key={`${line.media}-${line.objective}-${index}`}>
              <td className="border-b border-gray-100 px-2.5 py-2 align-top">
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${mediaBadgeClass(line.media)}`}
                >
                  {line.media}
                </span>
              </td>
              <td className="border-b border-gray-100 px-2.5 py-2 align-top">
                <div className="text-[11.5px] font-semibold text-gray-900">{line.objective}</div>
                {line.target && (
                  <div className="mt-0.5 text-[10.5px] leading-snug text-gray-400">
                    {line.target}
                  </div>
                )}
                {hasOwnRange && (
                  <div className="mt-0.5 text-[10.5px] text-gray-400">
                    라인 기간 {start} ~ {end} ({rangeDays(start, end)}일)
                  </div>
                )}
              </td>
              <td className="border-b border-gray-100 px-2.5 py-2 text-right align-top">
                <div className="flex items-center justify-end gap-1 text-[11.5px] font-bold tabular-nums text-gray-900">
                  {formatMoney(lineDaily(line, currency), currency)}
                  {mismatched && (
                    <span
                      title={`기간은 ${rangeDays(start, end)}일인데 일예산은 ${line.days}일 기준으로 산정돼 있습니다`}
                    >
                      <AlertTriangle size={11} className="text-amber-500" />
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[10px] font-medium tabular-nums text-gray-400">
                  {line.days}일 · {formatMoney(lineBudget(line, currency), currency)}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default LineTable
