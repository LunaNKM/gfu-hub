'use client'

import React from 'react'
import { clsx } from 'clsx'
import { Plus, Settings2 } from 'lucide-react'
import { AdCalendarBrand, AdCampaign } from '@/types'
import { AdCurrency, campaignBudget, formatCompact } from '@/lib/adCalendar/format'

interface BrandBarProps {
  brands: AdCalendarBrand[]
  campaigns: AdCampaign[]
  selected: Set<string>
  currency: AdCurrency
  mediaFilter: Set<string>
  onToggle: (brandId: string) => void
  onClear: () => void
  onAdd: () => void
  onEdit: (brand: AdCalendarBrand) => void
}

export function BrandBar({
  brands,
  campaigns,
  selected,
  currency,
  mediaFilter,
  onToggle,
  onClear,
  onAdd,
  onEdit,
}: BrandBarProps) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5">
      <span className="mr-0.5 text-xs font-semibold text-gray-500">브랜드</span>

      <button
        type="button"
        onClick={onClear}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
          selected.size === 0
            ? 'border-transparent bg-gray-700 text-white'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
        )}
      >
        전체 {brands.length}개
      </button>

      {brands.map((brand) => {
        const owned = campaigns.filter((c) => c.brandId === brand.id)
        const budget = owned.reduce((sum, c) => sum + campaignBudget(c, currency, mediaFilter), 0)
        const on = selected.has(brand.id)

        return (
          <span key={brand.id} className="group relative inline-flex">
            <button
              type="button"
              onClick={() => onToggle(brand.id)}
              style={on ? { background: brand.color } : undefined}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full border py-1.5 pl-2.5 pr-8 text-[12.5px] font-semibold transition-colors',
                on ? 'border-transparent text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{ background: on ? 'rgba(255,255,255,0.9)' : brand.color }}
              />
              {brand.name}
              <span
                className={clsx(
                  'text-[11px] font-semibold tabular-nums',
                  on ? 'text-white/80' : 'text-gray-400'
                )}
              >
                {owned.length ? formatCompact(budget, currency) : '—'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onEdit(brand)}
              title="브랜드 수정"
              className={clsx(
                'absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100',
                on ? 'text-white/80 hover:text-white' : 'text-gray-400 hover:text-gray-700'
              )}
            >
              <Settings2 size={12} />
            </button>
          </span>
        )
      })}

      <span className="flex-1" />

      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-500 transition-colors hover:border-blue-500 hover:text-blue-600"
      >
        <Plus size={13} />
        브랜드 추가
      </button>
    </div>
  )
}

export default BrandBar
