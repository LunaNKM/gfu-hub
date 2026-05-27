'use client'

import React, { useEffect, useRef, useState } from 'react'
import { X, AlignLeft, Calendar, CheckSquare, ChevronDownCircle, CircleDollarSign, Hash, Link2, Percent, Star, Tags, Type } from 'lucide-react'
import {
  CampaignDataColumn,
  CampaignDataRow,
  CampaignCellValue,
  CampaignColumnType,
} from '@/types'
import { getColor, autoColor } from '@/lib/palette'
import { normalizeCellValue } from './workspaceUtils'

// ── 타입 아이콘 ──────────────────────────────────────────────────────

const TYPE_ICON: Record<CampaignColumnType, React.ReactNode> = {
  text:         <Type size={13} />,
  long_text:    <AlignLeft size={13} />,
  number:       <Hash size={13} />,
  currency:     <CircleDollarSign size={13} />,
  percent:      <Percent size={13} />,
  date:         <Calendar size={13} />,
  select:       <ChevronDownCircle size={13} />,
  multi_select: <Tags size={13} />,
  checkbox:     <CheckSquare size={13} />,
  url:          <Link2 size={13} />,
  rating:       <Star size={13} />,
}

// ── 필드 에디터 ──────────────────────────────────────────────────────

function FieldEditor({
  column,
  value,
  onChange,
}: {
  column: CampaignDataColumn
  value: CampaignCellValue
  onChange: (value: CampaignCellValue) => void
}) {
  // 별점
  if (column.type === 'rating') {
    const max = column.config?.maxRating ?? 5
    const numVal = typeof value === 'number' ? value : 0
    const [hover, setHover] = useState(0)
    return (
      <div className="flex items-center gap-1 py-1">
        {Array.from({ length: max }, (_, i) => {
          const starVal = i + 1
          const filled = (hover || numVal) >= starVal
          return (
            <button
              key={i}
              type="button"
              className={`text-xl transition-colors ${filled ? 'text-amber-400' : 'text-gray-200 hover:text-amber-300'}`}
              onMouseEnter={() => setHover(starVal)}
              onMouseLeave={() => setHover(0)}
              onClick={() => onChange(numVal === starVal ? 0 : starVal)}
            >
              ★
            </button>
          )
        })}
      </div>
    )
  }

  // 체크박스
  if (column.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 py-1 cursor-pointer">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
        />
        <span className="text-sm text-gray-700">{value === true ? '예' : '아니오'}</span>
      </label>
    )
  }

  // 단일 셀렉트
  if (column.type === 'select') {
    const strVal = value ? String(value) : ''
    return (
      <select
        value={strVal}
        onChange={(e) => onChange(normalizeCellValue(e.target.value, 'select'))}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 bg-white"
      >
        <option value="">-</option>
        {column.options?.map((opt) => {
          const color = getColor(opt.color)
          return (
            <option key={opt.value} value={opt.value}>
              {opt.value}
            </option>
          )
        })}
      </select>
    )
  }

  // 멀티 셀렉트
  if (column.type === 'multi_select') {
    const values = Array.isArray(value) ? value : (value ? [String(value)] : [])
    const toggle = (v: string) => {
      const next = values.includes(v) ? values.filter((x) => x !== v) : [...values, v]
      onChange(next)
    }
    return (
      <div className="flex flex-wrap gap-1.5 py-1">
        {(column.options ?? []).map((opt) => {
          const color = getColor(opt.color)
          const selected = values.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className="rounded-full text-xs font-medium px-2.5 py-1 transition-opacity border"
              style={{
                background: selected ? color.bgSoft : '#f9fafb',
                color: selected ? color.text : '#6b7280',
                borderColor: selected ? color.border : '#e5e7eb',
                opacity: selected ? 1 : 0.7,
              }}
            >
              {opt.value}
            </button>
          )
        })}
        {values.filter((v) => !column.options?.some((o) => o.value === v)).map((v) => {
          const color = getColor(autoColor(v))
          return (
            <span
              key={v}
              className="rounded-full text-xs font-medium px-2.5 py-1 border"
              style={{ background: color.bgSoft, color: color.text, borderColor: color.border }}
            >
              {v}
            </span>
          )
        })}
      </div>
    )
  }

  // 긴 텍스트
  if (column.type === 'long_text') {
    return (
      <textarea
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value || null)}
        rows={5}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-y"
        placeholder="내용을 입력하세요..."
      />
    )
  }

  // URL
  if (column.type === 'url') {
    const strVal = String(value ?? '')
    return (
      <div className="flex flex-col gap-1">
        <input
          type="url"
          value={strVal}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-blue-600 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          placeholder="https://"
        />
        {strVal && (
          <a
            href={strVal}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline truncate"
          >
            {strVal}
          </a>
        )}
      </div>
    )
  }

  // 날짜
  if (column.type === 'date') {
    return (
      <input
        type="date"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
      />
    )
  }

  // 숫자 / 금액 / 퍼센트
  if (column.type === 'number' || column.type === 'currency' || column.type === 'percent') {
    const suffix = column.type === 'percent' ? '%' : column.type === 'currency' ? '원' : ''
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          placeholder="0"
        />
        {suffix && <span className="shrink-0 text-sm text-gray-400">{suffix}</span>}
      </div>
    )
  }

  // 기본 텍스트
  return (
    <input
      type="text"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
      placeholder="값을 입력하세요..."
    />
  )
}

// ── 패널 컴포넌트 ────────────────────────────────────────────────────

interface ExpandedRecordPanelProps {
  row: CampaignDataRow
  columns: CampaignDataColumn[]
  onCellChange: (rowId: string, colId: string, value: CampaignCellValue) => void
  onClose: () => void
}

export function ExpandedRecordPanel({ row, columns, onCellChange, onClose }: ExpandedRecordPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  // mount 후 슬라이드인 트리거
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setVisible(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  // ESC 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleClose = () => {
    setVisible(false)
    window.setTimeout(onClose, 200) // 애니메이션 후 언마운트
  }

  // 첫 번째 dimension 컬럼의 값을 레코드 제목으로
  const titleCol = columns.find((c) => c.role === 'dimension') ?? columns[0]
  const title = titleCol ? String(row.cells[titleCol.id] ?? '') || '(제목 없음)' : '레코드'

  return (
    <>
      {/* 오버레이 */}
      <div
        className="fixed inset-0 z-40 bg-black/10 transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />

      {/* 패널 */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 z-50 flex h-full w-[440px] max-w-full flex-col border-l border-gray-200 bg-white shadow-xl transition-transform duration-200"
        style={{ transform: visible ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* 헤더 */}
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
            <p className="text-xs text-gray-400 mt-0.5">레코드 상세</p>
          </div>
          <button
            onClick={handleClose}
            className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        {/* 필드 목록 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {columns.map((col) => (
            <div key={col.id} className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">{TYPE_ICON[col.type]}</span>
                <label className="text-xs font-medium text-gray-600">{col.name}</label>
              </div>
              <FieldEditor
                column={col}
                value={row.cells[col.id] ?? null}
                onChange={(value) => onCellChange(row.id, col.id, value)}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
