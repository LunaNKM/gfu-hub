'use client'

import React, { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { clsx } from 'clsx'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Plus, Upload } from 'lucide-react'
import { AdCalendarBrand, AdCampaign } from '@/types'
import { useAdCalendar } from '@/hooks/useAdCalendar'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { BrandBar } from '@/components/calendar/BrandBar'
import { SummaryTiles } from '@/components/calendar/SummaryTiles'
import { MonthGrid } from '@/components/calendar/MonthGrid'
import { BrandSwimlane } from '@/components/calendar/BrandSwimlane'
import { CampaignListView } from '@/components/calendar/CampaignListView'
import { DayDetailPanel } from '@/components/calendar/DayDetailPanel'
import { BrandModal } from '@/components/calendar/BrandModal'
import { CampaignModal } from '@/components/calendar/CampaignModal'
import { ColorBy } from '@/components/calendar/CampaignBar'
import { AdBrandInput, AdCampaignInput } from '@/lib/services/adCalendar'
import {
  AdCurrency,
  campaignLines,
  isCampaignActiveOn,
  isLineDaysMismatched,
  rangeDays,
  toDateString,
} from '@/lib/adCalendar/format'

// xlsx 파서가 무거워서 업로드를 열 때만 받아 온다.
const ImportModal = dynamic(
  () => import('@/components/calendar/ImportModal').then((m) => m.ImportModal),
  { ssr: false }
)

type ViewMode = 'month' | 'brand' | 'list'

const VIEWS: { key: ViewMode; label: string }[] = [
  { key: 'month', label: '월' },
  { key: 'brand', label: '브랜드' },
  { key: 'list', label: '목록' },
]

const CURRENCIES: { key: AdCurrency; label: string }[] = [
  { key: 'JPY', label: '¥ 넷' },
  { key: 'KRW', label: '₩ 넷' },
]

const MEDIA_PRESETS = ['s-meta', 'meta', 'X', 'TikTok']

export default function AdCalendarPage() {
  const today = toDateString(new Date())
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState(today)
  const [brandFilter, setBrandFilter] = useState<Set<string>>(new Set())
  const [mediaFilter, setMediaFilter] = useState<Set<string>>(new Set())
  const [currency, setCurrency] = useState<AdCurrency>('JPY')
  const [view, setView] = useState<ViewMode>('month')
  const [colorBy, setColorBy] = useState<ColorBy>('brand')
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null)

  const [brandModal, setBrandModal] = useState<{ open: boolean; brand: AdCalendarBrand | null }>({
    open: false,
    brand: null,
  })
  const [campaignModal, setCampaignModal] = useState<{
    open: boolean
    campaign: AdCampaign | null
  }>({ open: false, campaign: null })
  const [importOpen, setImportOpen] = useState(false)

  const calendar = useAdCalendar(month)
  const { showToast } = useToast()

  const visibleBrands = useMemo(
    () =>
      calendar.brands.filter(
        (brand) => !brand.archived && (brandFilter.size === 0 || brandFilter.has(brand.id))
      ),
    [calendar.brands, brandFilter]
  )

  const brandMap = useMemo(
    () => new Map(calendar.brands.map((brand) => [brand.id, brand])),
    [calendar.brands]
  )

  /** 브랜드·매체 필터를 통과한 캠페인만 화면에 넘긴다. */
  const visibleCampaigns = useMemo(
    () =>
      calendar.campaigns.filter((campaign) => {
        if (brandFilter.size > 0 && !brandFilter.has(campaign.brandId)) return false
        return campaignLines(campaign, mediaFilter).length > 0
      }),
    [calendar.campaigns, brandFilter, mediaFilter]
  )

  const activeCampaign = activeCampaignId
    ? visibleCampaigns.find((c) => c.id === activeCampaignId) ?? null
    : null

  const dayCampaigns = visibleCampaigns.filter((c) => isCampaignActiveOn(c, selectedDate))

  /** 믹스안 산정일수가 실제 기간과 어긋난 캠페인 — 화면 아래 경고에 쓴다. */
  const mismatched = visibleCampaigns
    .map((campaign) => {
      const bad = campaignLines(campaign, mediaFilter).filter((line) =>
        isLineDaysMismatched(campaign, line)
      )
      return { campaign, days: Array.from(new Set(bad.map((line) => line.days))) }
    })
    .filter((entry) => entry.days.length > 0)

  const goMonth = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1)
    setMonth(next)
    setActiveCampaignId(null)
    setSelectedDate(
      next.getFullYear() === new Date().getFullYear() && next.getMonth() === new Date().getMonth()
        ? today
        : toDateString(next)
    )
  }

  const toggleMedia = (media: string) => {
    setMediaFilter((prev) => {
      const next = new Set(prev)
      if (next.has(media)) next.delete(media)
      else next.add(media)
      return next
    })
  }

  const handleSaveBrand = async (data: AdBrandInput) => {
    try {
      if (brandModal.brand) await calendar.updateBrand(brandModal.brand.id, data)
      else await calendar.createBrand(data)
      showToast('브랜드가 저장되었습니다.', 'success')
    } catch {
      showToast('브랜드 저장에 실패했습니다.', 'error')
    }
  }

  const handleSaveCampaign = async (data: AdCampaignInput) => {
    try {
      if (campaignModal.campaign) await calendar.updateCampaign(campaignModal.campaign.id, data)
      else await calendar.createCampaign(data)
      showToast('캠페인이 저장되었습니다.', 'success')
    } catch {
      showToast('캠페인 저장에 실패했습니다.', 'error')
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">광고 캘린더</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            브랜드별 캠페인 일정 · 매체 · 목표 · 마크업 제외 일예산
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <Upload size={15} className="mr-1.5" />
            미디어믹스 업로드
          </Button>
          <Button
            onClick={() => setCampaignModal({ open: true, campaign: null })}
            disabled={calendar.brands.length === 0}
          >
            <Plus size={15} className="mr-1.5" />
            캠페인 추가
          </Button>
        </div>
      </div>

      <BrandBar
        brands={calendar.brands.filter((brand) => !brand.archived)}
        campaigns={calendar.campaigns}
        selected={brandFilter}
        currency={currency}
        mediaFilter={mediaFilter}
        onToggle={(brandId) =>
          setBrandFilter((prev) => {
            const next = new Set(prev)
            if (next.has(brandId)) next.delete(brandId)
            else next.add(brandId)
            return next
          })
        }
        onClear={() => setBrandFilter(new Set())}
        onAdd={() => setBrandModal({ open: true, brand: null })}
        onEdit={(brand) => setBrandModal({ open: true, brand })}
      />

      <SummaryTiles
        month={month}
        campaigns={visibleCampaigns}
        currency={currency}
        mediaFilter={mediaFilter}
        selectedDate={selectedDate}
      />

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goMonth(-1)}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[118px] text-center text-base font-bold text-gray-900">
            {month.getFullYear()}년 {month.getMonth() + 1}월
          </span>
          <button
            type="button"
            onClick={() => goMonth(1)}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const now = new Date()
            setMonth(new Date(now.getFullYear(), now.getMonth(), 1))
            setSelectedDate(today)
            setActiveCampaignId(null)
          }}
        >
          오늘
        </Button>

        <span className="h-5 w-px bg-gray-200" />

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMediaFilter(new Set())}
            className={clsx(
              'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
              mediaFilter.size === 0
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            전체 매체
          </button>
          {MEDIA_PRESETS.map((media) => (
            <button
              key={media}
              type="button"
              onClick={() => toggleMedia(media)}
              className={clsx(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                mediaFilter.has(media)
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {media}
            </button>
          ))}
        </div>

        <span className="h-5 w-px bg-gray-200" />

        <div className="flex overflow-hidden rounded-lg border border-gray-200">
          {CURRENCIES.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setCurrency(option.key)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                currency === option.key ? 'bg-blue-50 text-blue-600' : 'bg-white text-gray-600'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex overflow-hidden rounded-lg border border-gray-200">
          {VIEWS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setView(option.key)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                view === option.key ? 'bg-blue-50 text-blue-600' : 'bg-white text-gray-600'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setColorBy(colorBy === 'brand' ? 'campaign' : 'brand')}
          className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200"
        >
          {colorBy === 'brand' ? '캠페인별 색상으로' : '브랜드별 색상으로'}
        </button>

        <span className="ml-auto text-xs text-gray-400">
          일예산 = 마크업 제외 매체비 ÷ 산정일수
        </span>
      </div>

      {calendar.loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : calendar.error ? (
        <ErrorState message={calendar.error} onRetry={calendar.refetch} />
      ) : calendar.brands.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={40} />}
          title="브랜드를 먼저 추가해 주세요"
          description="광고 캘린더는 브랜드별로 캠페인을 관리합니다. 브랜드를 추가한 뒤 미디어믹스를 업로드하세요."
          action={
            <Button onClick={() => setBrandModal({ open: true, brand: null })}>
              <Plus size={15} className="mr-1.5" />
              브랜드 추가
            </Button>
          }
        />
      ) : (
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            {view === 'month' && (
              <MonthGrid
                month={month}
                campaigns={visibleCampaigns}
                brandMap={brandMap}
                currency={currency}
                mediaFilter={mediaFilter}
                colorBy={colorBy}
                showBrandShort={brandFilter.size !== 1}
                selectedDate={selectedDate}
                activeCampaignId={activeCampaignId}
                today={today}
                onSelectDate={(date) => {
                  setSelectedDate(date)
                  setActiveCampaignId(null)
                }}
                onSelectCampaign={(id) =>
                  setActiveCampaignId((prev) => (prev === id ? null : id))
                }
              />
            )}

            {view === 'brand' && (
              <BrandSwimlane
                month={month}
                brands={visibleBrands}
                campaigns={visibleCampaigns}
                currency={currency}
                mediaFilter={mediaFilter}
                colorBy={colorBy}
                activeCampaignId={activeCampaignId}
                today={today}
                onSelectCampaign={(id) =>
                  setActiveCampaignId((prev) => (prev === id ? null : id))
                }
              />
            )}

            {view === 'list' && (
              <CampaignListView
                month={month}
                brands={visibleBrands}
                campaigns={visibleCampaigns}
                currency={currency}
                mediaFilter={mediaFilter}
                colorBy={colorBy}
                onEdit={(campaign) => setCampaignModal({ open: true, campaign })}
              />
            )}

            {mismatched.length > 0 && (
              <div className="mt-3.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
                <div className="mb-1 flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle size={13} />
                  일예산 산정 기준 확인 필요
                </div>
                믹스안의 일예산이 캠페인 기간이 아닌 다른 일수로 나뉘어 있습니다. 값은 믹스안 그대로
                두었으니, 라인별 실제 기간을 알면 캠페인 수정에서 고쳐 주세요.
                {mismatched.map(({ campaign, days }) => (
                  <div key={campaign.id} className="mt-1">
                    ·{' '}
                    <button
                      type="button"
                      onClick={() => setCampaignModal({ open: true, campaign })}
                      className="font-bold underline decoration-amber-400 underline-offset-2"
                    >
                      {brandMap.get(campaign.brandId)?.name} {campaign.name}
                    </button>{' '}
                    ({rangeDays(campaign.startDate, campaign.endDate)}일 표기) → 라인 산정일수{' '}
                    {days.join(' / ')}일
                  </div>
                ))}
              </div>
            )}
          </div>

          {view !== 'list' && (
            <aside className="w-[346px] shrink-0">
              <DayDetailPanel
                selectedDate={selectedDate}
                activeCampaign={activeCampaign}
                campaigns={dayCampaigns}
                brands={visibleBrands}
                currency={currency}
                mediaFilter={mediaFilter}
                colorBy={colorBy}
                onEdit={(campaign) => setCampaignModal({ open: true, campaign })}
              />
            </aside>
          )}
        </div>
      )}

      <BrandModal
        isOpen={brandModal.open}
        brand={brandModal.brand}
        brandCount={calendar.brands.length}
        onClose={() => setBrandModal({ open: false, brand: null })}
        onSave={handleSaveBrand}
        onDelete={async (brandId) => {
          try {
            await calendar.deleteBrand(brandId)
            setBrandFilter((prev) => {
              const next = new Set(prev)
              next.delete(brandId)
              return next
            })
            showToast('브랜드를 삭제했습니다.', 'success')
          } catch {
            showToast('브랜드 삭제에 실패했습니다.', 'error')
          }
        }}
      />

      <CampaignModal
        isOpen={campaignModal.open}
        campaign={campaignModal.campaign}
        brands={calendar.brands.filter((brand) => !brand.archived)}
        defaultBrandId={brandFilter.size === 1 ? Array.from(brandFilter)[0] : undefined}
        defaultMonth={month}
        currency={currency}
        onClose={() => setCampaignModal({ open: false, campaign: null })}
        onSave={handleSaveCampaign}
        onDelete={async (campaignId) => {
          try {
            await calendar.deleteCampaign(campaignId)
            setActiveCampaignId(null)
            showToast('캠페인을 삭제했습니다.', 'success')
          } catch {
            showToast('캠페인 삭제에 실패했습니다.', 'error')
          }
        }}
      />

      <ImportModal
        isOpen={importOpen}
        brands={calendar.brands.filter((brand) => !brand.archived)}
        month={month}
        onClose={() => setImportOpen(false)}
        onImport={async (items) => {
          const count = await calendar.importCampaigns(items)
          showToast(`캠페인 ${count}건을 가져왔습니다.`, 'success')
          return count
        }}
      />
    </div>
  )
}
