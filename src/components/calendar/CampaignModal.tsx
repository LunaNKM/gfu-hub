'use client'

import React, { useEffect, useState } from 'react'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { AdCalendarBrand, AdCampaign, AdCampaignLine } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { AdCampaignInput } from '@/lib/services/adCalendar'
import {
  AdCurrency,
  CAMPAIGN_COLORS,
  CURRENCY_META,
  formatMoney,
  lineDaily,
  rangeDays,
  toDateString,
} from '@/lib/adCalendar/format'

interface CampaignModalProps {
  isOpen: boolean
  campaign: AdCampaign | null
  brands: AdCalendarBrand[]
  defaultBrandId?: string
  defaultMonth: Date
  currency: AdCurrency
  onClose: () => void
  onSave: (data: AdCampaignInput) => Promise<void>
  onDelete?: (campaignId: string) => Promise<void>
}

const FIELD =
  'w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const LABEL = 'text-[11px] font-semibold text-gray-500'

function emptyLine(): AdCampaignLine {
  return { media: '', objective: '', target: '', budgetJpNet: 0, budgetKrNet: 0, days: 1 }
}

/**
 * 캠페인 · 라인 편집.
 * 미디어믹스에서 가져온 값은 그대로 두되, 산정일수(days)와 라인별 기간을 여기서 고칠 수 있다.
 * 믹스안 일수가 캠페인 기간과 다를 때 ⚠ 를 띄우고 한 번에 맞출 수 있는 버튼을 준다.
 */
export function CampaignModal({
  isOpen,
  campaign,
  brands,
  defaultBrandId,
  defaultMonth,
  currency,
  onClose,
  onSave,
  onDelete,
}: CampaignModalProps) {
  const [brandId, setBrandId] = useState('')
  const [name, setName] = useState('')
  const [channel, setChannel] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [color, setColor] = useState(CAMPAIGN_COLORS[0])
  const [targetRoas, setTargetRoas] = useState('')
  const [lines, setLines] = useState<AdCampaignLine[]>([emptyLine()])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const monthStart = new Date(defaultMonth.getFullYear(), defaultMonth.getMonth(), 1)
    const monthEnd = new Date(defaultMonth.getFullYear(), defaultMonth.getMonth() + 1, 0)

    setBrandId(campaign?.brandId ?? defaultBrandId ?? brands[0]?.id ?? '')
    setName(campaign?.name ?? '')
    setChannel(campaign?.channel ?? 'Qoo10')
    setStartDate(campaign?.startDate ?? toDateString(monthStart))
    setEndDate(campaign?.endDate ?? toDateString(monthEnd))
    setColor(campaign?.color ?? CAMPAIGN_COLORS[0])
    setTargetRoas(campaign?.targetRoas ? String(campaign.targetRoas) : '')
    setLines(campaign ? campaign.lines.map((l) => ({ ...l })) : [emptyLine()])
  }, [isOpen, campaign, brands, defaultBrandId, defaultMonth])

  const span = startDate && endDate && endDate >= startDate ? rangeDays(startDate, endDate) : 0
  const invalidRange = Boolean(startDate && endDate) && endDate < startDate

  const patchLine = (index: number, patch: Partial<AdCampaignLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  const handleSave = async () => {
    if (!brandId || !name.trim() || invalidRange) return
    setSaving(true)
    try {
      await onSave({
        brandId,
        name: name.trim(),
        channel: channel.trim(),
        startDate,
        endDate,
        color,
        ...(targetRoas ? { targetRoas: Number(targetRoas) } : {}),
        ...(campaign?.source ? { source: campaign.source } : {}),
        lines: lines
          .filter((line) => line.media.trim() || line.objective.trim())
          .map((line) => ({
            ...line,
            media: line.media.trim() || '—',
            objective: line.objective.trim() || '—',
            days: Math.max(1, Math.round(line.days) || 1),
          })),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!campaign || !onDelete) return
    if (!confirm(`'${campaign.name}' 캠페인을 삭제할까요?`)) return
    setSaving(true)
    try {
      await onDelete(campaign.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={campaign ? '캠페인 수정' : '캠페인 추가'}
      size="lg"
    >
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>브랜드</span>
            <select className={FIELD} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>캠페인명</span>
            <input
              className={FIELD}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="3분기 메가와리"
            />
          </label>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>채널</span>
            <input className={FIELD} value={channel} onChange={(e) => setChannel(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>시작일</span>
            <input
              type="date"
              className={FIELD}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>종료일</span>
            <input
              type="date"
              className={FIELD}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>목표 ROAS</span>
            <input
              type="number"
              step="0.01"
              className={FIELD}
              value={targetRoas}
              onChange={(e) => setTargetRoas(e.target.value)}
              placeholder="3.45"
            />
          </label>
        </div>

        {invalidRange ? (
          <p className="text-xs text-red-500">종료일이 시작일보다 빠릅니다.</p>
        ) : (
          <p className="text-xs text-gray-400">캠페인 기간 {span}일</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className={LABEL}>캠페인 색상</span>
          {CAMPAIGN_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setColor(option)}
              style={{ background: option }}
              className={`h-6 w-6 rounded-md transition-transform ${
                color === option ? 'scale-110 ring-2 ring-gray-900 ring-offset-2' : ''
              }`}
            />
          ))}
        </div>

        <div className="border-t border-gray-100 pt-3">
          <div className="mb-2 flex items-center">
            <h3 className="text-sm font-bold text-gray-900">광고 라인</h3>
            <span className="ml-2 text-[11px] text-gray-400">
              일예산 = 넷 매체비 ÷ 산정일수 ({CURRENCY_META[currency].label} 기준으로 미리보기)
            </span>
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
            >
              <Plus size={12} />
              라인 추가
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            {lines.map((line, index) => {
              const lineSpan =
                line.startDate && line.endDate
                  ? rangeDays(line.startDate, line.endDate)
                  : span
              const mismatched = lineSpan > 0 && line.days !== lineSpan

              return (
                <div key={index} className="rounded-lg border border-gray-200 p-2.5">
                  <div className="mb-2 grid grid-cols-[100px_1fr_1.4fr_28px] gap-2">
                    <input
                      className={FIELD}
                      value={line.media}
                      onChange={(e) => patchLine(index, { media: e.target.value })}
                      placeholder="s-meta"
                    />
                    <input
                      className={FIELD}
                      value={line.objective}
                      onChange={(e) => patchLine(index, { objective: e.target.value })}
                      placeholder="Purchase"
                    />
                    <input
                      className={FIELD}
                      value={line.target}
                      onChange={(e) => patchLine(index, { target: e.target.value })}
                      placeholder="Qoo10 / 2054F"
                    />
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      className="flex items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      title="라인 삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-[1fr_1fr_92px_1fr] gap-2">
                    <label className="flex flex-col gap-1">
                      <span className={LABEL}>JP 넷 (¥)</span>
                      <input
                        type="number"
                        className={FIELD}
                        value={line.budgetJpNet || ''}
                        onChange={(e) =>
                          patchLine(index, { budgetJpNet: Number(e.target.value) || 0 })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={LABEL}>KR 넷 (₩)</span>
                      <input
                        type="number"
                        className={FIELD}
                        value={line.budgetKrNet || ''}
                        onChange={(e) =>
                          patchLine(index, { budgetKrNet: Number(e.target.value) || 0 })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={LABEL}>산정일수</span>
                      <input
                        type="number"
                        min={1}
                        className={FIELD}
                        value={line.days || ''}
                        onChange={(e) => patchLine(index, { days: Number(e.target.value) || 1 })}
                      />
                    </label>
                    <div className="flex flex-col gap-1">
                      <span className={LABEL}>일예산</span>
                      <div className="flex h-[34px] items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 text-sm font-bold tabular-nums text-gray-900">
                        {formatMoney(lineDaily(line, currency), currency)}
                        {mismatched && (
                          <AlertTriangle size={12} className="shrink-0 text-amber-500" />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={LABEL}>라인 기간</span>
                    <input
                      type="date"
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500"
                      value={line.startDate ?? ''}
                      onChange={(e) =>
                        patchLine(index, { startDate: e.target.value || undefined })
                      }
                    />
                    <span className="text-xs text-gray-400">~</span>
                    <input
                      type="date"
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-500"
                      value={line.endDate ?? ''}
                      onChange={(e) => patchLine(index, { endDate: e.target.value || undefined })}
                    />
                    <span className="text-[11px] text-gray-400">
                      비우면 캠페인 기간({span}일)을 따릅니다
                    </span>
                    {mismatched && (
                      <button
                        type="button"
                        onClick={() => patchLine(index, { days: lineSpan })}
                        className="ml-auto rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-100"
                      >
                        산정일수를 기간({lineSpan}일)에 맞추기
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
          {campaign && onDelete && (
            <Button variant="danger" onClick={handleDelete} disabled={saving}>
              삭제
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!brandId || !name.trim() || invalidRange}
          >
            저장
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default CampaignModal
