'use client'

import React, { useEffect, useRef, useState } from 'react'
import { CampaignDataColumn, CampaignCellValue } from '@/types'
import { normalizeCellValue } from './workspaceUtils'
import { getColor, autoColor } from '@/lib/palette'

export type NavigateDir = 'up' | 'down' | 'left' | 'right' | 'tab'

interface EditableCellProps {
  value: CampaignCellValue
  column: CampaignDataColumn
  rowId: string
  colId: string
  editing: boolean
  onStartEdit: () => void
  onStopEdit: () => void
  onChange: (value: CampaignCellValue) => void
  onNavigate?: (dir: NavigateDir) => boolean | void
  onPaste?: (text: string) => void
  onAfterCommit?: () => void
}

// ── 별점 컴포넌트 ─────────────────────────────────────────────────

function RatingCell({ value, column, onChange }: {
  value: CampaignCellValue
  column: CampaignDataColumn
  onChange: (value: CampaignCellValue) => void
}) {
  const max = column.config?.maxRating ?? 5
  const numVal = typeof value === 'number' ? value : 0
  const [hoverVal, setHoverVal] = useState(0)

  return (
    <div className="flex h-full w-full items-center gap-0.5 px-1">
      {Array.from({ length: max }, (_, i) => {
        const starVal = i + 1
        const filled = (hoverVal || numVal) >= starVal
        return (
          <button
            key={i}
            type="button"
            className={`text-base leading-none transition-colors ${filled ? 'text-amber-400' : 'text-gray-200 hover:text-amber-300'}`}
            onMouseEnter={() => setHoverVal(starVal)}
            onMouseLeave={() => setHoverVal(0)}
            onClick={() => onChange(numVal === starVal ? 0 : starVal)}
            aria-label={`${starVal}점`}
          >
            ★
          </button>
        )
      })}
    </div>
  )
}

// ── 멀티셀렉트 드롭다운 ───────────────────────────────────────────

function MultiSelectDropdown({ value, column, onChange, onClose }: {
  value: string[]
  column: CampaignDataColumn
  onChange: (value: CampaignCellValue) => void
  onClose: () => void
}) {
  const [newOption, setNewOption] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose()
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [onClose])

  const toggle = (optValue: string) => {
    const next = value.includes(optValue)
      ? value.filter((v) => v !== optValue)
      : [...value, optValue]
    onChange(next)
  }

  const addNewOption = () => {
    const trimmed = newOption.trim()
    if (!trimmed) return
    if (!value.includes(trimmed)) onChange([...value, trimmed])
    setNewOption('')
  }

  return (
    <div
      ref={containerRef}
      className="absolute z-[1000] mt-1 min-w-[160px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
      style={{ top: '100%', left: 0 }}
    >
      {(column.options ?? []).length > 0 && (
        <div className="max-h-40 overflow-y-auto">
          {(column.options ?? []).map((opt) => {
            const color = getColor(opt.color)
            const selected = value.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-gray-50"
              >
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-sm border"
                  style={{
                    background: selected ? color.bg : 'white',
                    borderColor: selected ? color.bg : '#d1d5db',
                  }}
                />
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ background: color.bgSoft, color: color.text, border: `1px solid ${color.border}` }}
                >
                  {opt.value}
                </span>
              </button>
            )
          })}
        </div>
      )}
      <div className="border-t border-gray-100 px-2 py-1.5">
        <input
          autoFocus={column.options?.length === 0}
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addNewOption() }
            if (e.key === 'Escape') onClose()
          }}
          placeholder="새 옵션 추가..."
          className="w-full rounded px-2 py-1 text-xs outline-none border border-gray-200 focus:border-blue-400"
        />
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

export function EditableCell({
  value,
  column,
  rowId,
  colId,
  editing,
  onStartEdit,
  onStopEdit,
  onChange,
  onNavigate,
  onPaste,
  onAfterCommit,
}: EditableCellProps) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(null)
  const wasEditingRef = useRef(false)
  const suppressNextBlurCommitRef = useRef(false)

  useEffect(() => {
    if (editing && !wasEditingRef.current) {
      setDraft(value == null ? '' : Array.isArray(value) ? value.join(', ') : String(value))
    }
    wasEditingRef.current = editing
  }, [editing, value])

  useEffect(() => {
    if (editing) {
      const raf = window.requestAnimationFrame(() => {
        inputRef.current?.focus()
        if (inputRef.current instanceof HTMLInputElement) inputRef.current.select()
      })
      return () => window.cancelAnimationFrame(raf)
    }
  }, [editing])

  const startEdit = () => {
    setDraft(value == null ? '' : Array.isArray(value) ? value.join(', ') : String(value))
    onStartEdit()
  }

  const commit = (nextDraft = draft) => {
    onChange(normalizeCellValue(nextDraft, column.type))
    onStopEdit()
    onAfterCommit?.()
  }

  const commitAndNavigate = (dir: NavigateDir) => {
    onChange(normalizeCellValue(draft, column.type))
    const moved = onNavigate?.(dir)
    if (!moved) {
      onStopEdit()
      onAfterCommit?.()
      return
    }
    suppressNextBlurCommitRef.current = true
  }

  const handleBlurCommit = () => {
    if (suppressNextBlurCommitRef.current) {
      suppressNextBlurCommitRef.current = false
      return
    }
    commit()
  }

  const baseViewProps = {
    tabIndex: 0,
    'data-cell-row': rowId,
    'data-cell-col': colId,
    'data-editable-cell': 'true',
    className: 'flex h-full w-full cursor-text items-center overflow-hidden rounded-sm outline-none focus:ring-1 focus:ring-blue-400 focus:ring-inset',
    onPaste: (event: React.ClipboardEvent) => {
      const text = event.clipboardData?.getData('text')
      if (text && onPaste) { event.preventDefault(); onPaste(text) }
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); startEdit() }
      else if (event.key === 'Tab') { event.preventDefault(); onNavigate?.(event.shiftKey ? 'left' : 'tab') }
      else if (event.key === 'ArrowUp') { event.preventDefault(); onNavigate?.('up') }
      else if (event.key === 'ArrowDown') { event.preventDefault(); onNavigate?.('down') }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); onNavigate?.('left') }
      else if (event.key === 'ArrowRight') { event.preventDefault(); onNavigate?.('right') }
    },
    role: 'gridcell' as const,
    'aria-label': `${column.name} 셀`,
  }

  // ── 체크박스 ───────────────────────────────────────────────────
  if (column.type === 'checkbox') {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-1 focus:ring-blue-400"
          aria-label="체크박스"
        />
      </div>
    )
  }

  // ── 별점 ──────────────────────────────────────────────────────
  if (column.type === 'rating') {
    return <RatingCell value={value} column={column} onChange={onChange} />
  }

  // ── 멀티셀렉트 ─────────────────────────────────────────────────
  if (column.type === 'multi_select') {
    const values = Array.isArray(value) ? value : (value ? [String(value)] : [])

    if (!editing) {
      return (
        <div
          {...baseViewProps}
          className="flex h-full w-full cursor-pointer items-center gap-1 overflow-hidden rounded-sm px-1 outline-none focus:ring-1 focus:ring-blue-400 focus:ring-inset"
          onClick={() => startEdit()}
        >
          {values.length === 0 && <span className="pointer-events-none select-none text-gray-300 text-xs">-</span>}
          {values.slice(0, 2).map((v) => {
            const opt = column.options?.find((o) => o.value === v)
            const color = opt?.color ? getColor(opt.color) : getColor(autoColor(v))
            return (
              <span
                key={v}
                className="shrink-0 truncate rounded-full text-[11px] font-medium leading-none"
                style={{
                  background: color.bgSoft,
                  color: color.text,
                  border: `1px solid ${color.border}`,
                  padding: '2px 8px',
                  maxWidth: 90,
                }}
              >
                {v}
              </span>
            )
          })}
          {values.length > 2 && (
            <span className="shrink-0 text-[10px] text-gray-400">+{values.length - 2}</span>
          )}
        </div>
      )
    }

    return (
      <div className="relative h-full w-full">
        <MultiSelectDropdown
          value={values}
          column={column}
          onChange={(next) => { onChange(next); onStopEdit() }}
          onClose={onStopEdit}
        />
      </div>
    )
  }

  // ── 단일 셀렉트 ───────────────────────────────────────────────
  if (column.type === 'select') {
    if (!editing) {
      return (
        <div
          {...baseViewProps}
          onClick={() => startEdit()}
        >
          <DisplayValue value={value} column={column} />
        </div>
      )
    }

    return (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        data-cell-row={rowId}
        data-cell-col={colId}
        data-editable-cell="true"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={handleBlurCommit}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); commitAndNavigate('down') }
          else if (event.key === 'Tab') { event.preventDefault(); commitAndNavigate(event.shiftKey ? 'left' : 'tab') }
          else if (event.key === 'Escape') onStopEdit()
        }}
        className="h-full w-full border-0 bg-transparent text-xs outline-none"
      >
        <option value="">-</option>
        {column.options?.map((option) => (
          <option key={option.value} value={option.value}>{option.value}</option>
        ))}
      </select>
    )
  }

  // ── 롱텍스트 ─────────────────────────────────────────────────
  if (column.type === 'long_text') {
    if (!editing) {
      return (
        <div
          {...baseViewProps}
          onClick={() => startEdit()}
        >
          <span className="truncate text-xs text-gray-800">{String(value ?? '')}</span>
        </div>
      )
    }

    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        data-cell-row={rowId}
        data-cell-col={colId}
        data-editable-cell="true"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlurCommit}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { onStopEdit(); return }
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitAndNavigate('down'); return }
          if (e.key === 'Tab') { e.preventDefault(); commitAndNavigate(e.shiftKey ? 'left' : 'tab') }
        }}
        rows={3}
        className="h-full w-full min-w-0 border-0 bg-transparent px-0 text-xs outline-none focus:ring-0 resize-none"
        style={{ minHeight: 72 }}
      />
    )
  }

  // ── 기본 텍스트/숫자/날짜 ─────────────────────────────────────
  if (!editing) {
    return (
      <div
        {...baseViewProps}
        onClick={() => startEdit()}
      >
        <DisplayValue value={value} column={column} />
      </div>
    )
  }

  const inputType =
    column.type === 'date'
      ? 'date'
      : column.type === 'number' || column.type === 'currency' || column.type === 'percent'
        ? 'number'
        : 'text'

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      data-cell-row={rowId}
      data-cell-col={colId}
      data-editable-cell="true"
      type={inputType}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={handleBlurCommit}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); commitAndNavigate('down') }
        else if (event.key === 'Tab') { event.preventDefault(); commitAndNavigate(event.shiftKey ? 'left' : 'tab') }
        else if (event.key === 'Escape') onStopEdit()
      }}
      className="h-full w-full min-w-0 border-0 bg-transparent px-0 text-xs outline-none focus:ring-0"
    />
  )
}

// ── DisplayValue ─────────────────────────────────────────────────

function DisplayValue({ value, column }: { value: CampaignCellValue; column: CampaignDataColumn }) {
  if (value === null || value === undefined || value === '') {
    return <span className="pointer-events-none select-none text-gray-300">-</span>
  }

  if (column.type === 'currency') {
    return <span className="text-xs text-gray-800">{typeof value === 'number' ? value.toLocaleString() : String(value)}</span>
  }
  if (column.type === 'percent') {
    return <span className="text-xs text-gray-800">{typeof value === 'number' ? `${value}%` : String(value)}</span>
  }
  if (column.type === 'url') {
    const text = String(value)
    return <span className="block max-w-full truncate text-xs text-blue-500" title={text}>{text}</span>
  }
  if (column.type === 'select') {
    const text = String(value)
    const opt = column.options?.find((o) => o.value === text)
    const color = opt?.color ? getColor(opt.color) : getColor(autoColor(text))
    return (
      <span
        className="inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-full text-[11px] font-medium"
        style={{
          background: color.bgSoft,
          color: color.text,
          border: `1px solid ${color.border}`,
          padding: '1px 8px',
        }}
      >
        {text}
      </span>
    )
  }

  return <span className="truncate text-xs text-gray-800">{String(value)}</span>
}
