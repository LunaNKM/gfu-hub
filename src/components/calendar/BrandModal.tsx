'use client'

import React, { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { AdCalendarBrand } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AdBrandInput } from '@/lib/services/adCalendar'
import { BRAND_COLORS } from '@/lib/adCalendar/format'

interface BrandModalProps {
  isOpen: boolean
  brand: AdCalendarBrand | null
  /** 새 브랜드에 붙일 기본 순서·색 계산용 */
  brandCount: number
  onClose: () => void
  onSave: (data: AdBrandInput) => Promise<void>
  onDelete?: (brandId: string) => Promise<void>
}

export function BrandModal({
  isOpen,
  brand,
  brandCount,
  onClose,
  onSave,
  onDelete,
}: BrandModalProps) {
  const [name, setName] = useState('')
  const [short, setShort] = useState('')
  const [color, setColor] = useState(BRAND_COLORS[0])
  const [markupRate, setMarkupRate] = useState('15')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setName(brand?.name ?? '')
    setShort(brand?.short ?? '')
    setColor(brand?.color ?? BRAND_COLORS[brandCount % BRAND_COLORS.length])
    setMarkupRate(String(Math.round((brand?.markupRate ?? 0.15) * 100)))
  }, [isOpen, brand, brandCount])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        short: (short.trim() || name.trim().slice(0, 4)).toUpperCase(),
        color,
        market: brand?.market ?? 'JP',
        markupRate: (Number(markupRate) || 0) / 100,
        order: brand?.order ?? brandCount,
        archived: brand?.archived ?? false,
        ...(brand?.linkedBrandId ? { linkedBrandId: brand.linkedBrandId } : {}),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!brand || !onDelete) return
    if (
      !confirm(
        `'${brand.name}' 브랜드를 삭제합니다.\n이 브랜드의 캠페인도 함께 삭제됩니다. 계속할까요?`
      )
    )
      return
    setSaving(true)
    try {
      await onDelete(brand.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={brand ? '브랜드 수정' : '브랜드 추가'}>
      <div className="flex flex-col gap-4">
        <Input
          label="브랜드명"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="위시컴퍼니"
        />
        <Input
          label="약칭"
          value={short}
          onChange={(e) => setShort(e.target.value)}
          placeholder="WISH"
          helperText="달력 바에 붙는 짧은 이름입니다. 비우면 브랜드명 앞 네 글자를 씁니다."
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">색상</span>
          <div className="flex flex-wrap gap-2">
            {BRAND_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setColor(option)}
                style={{ background: option }}
                className={clsx(
                  'h-7 w-7 rounded-lg transition-transform',
                  color === option && 'scale-110 ring-2 ring-gray-900 ring-offset-2'
                )}
              />
            ))}
          </div>
        </div>

        <Input
          label="운영 수수료 (%)"
          type="number"
          value={markupRate}
          onChange={(e) => setMarkupRate(e.target.value)}
          helperText="표시용입니다. 일예산은 마크업 제외(넷) 기준으로만 계산합니다."
        />

        <div className="flex items-center gap-2 pt-1">
          {brand && onDelete && (
            <Button variant="danger" onClick={handleDelete} disabled={saving}>
              삭제
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={!name.trim()}>
            저장
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default BrandModal
