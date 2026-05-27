'use client'

import React, { useState } from 'react'
import { CampaignDataColumn } from '@/types'
import { normalizeCellValue, tagColor } from './workspaceUtils'

export type NavigateDir = 'up' | 'down' | 'left' | 'right' | 'tab'

interface EditableCellProps {
  value: string | number | boolean | null
  column: CampaignDataColumn
  rowId: string
  colId: string
  onChange: (value: string | number | boolean | null) => void
  onNavigate?: (dir: NavigateDir) => void
  onPaste?: (text: string) => void
}

// ── 값 표시 컴포넌트 ─────────────────────────────────────────────

function DisplayValue({
  value,
  column,
}: {
  value: string | number | boolean | null
  column: CampaignDataColumn
}) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-300 select-none pointer-events-none">—</span>
  }

  switch (column.type) {
    case 'currency':
      return (
        <span className="text-gray-800 text-xs">
          {typeof value === 'number' ? `₩${value.toLocaleString()}` : String(value)}
        </span>
      )
    case 'percent':
      return (
        <span className="text-gray-800 text-xs">
          {typeof value === 'number' ? `${value}%` : String(value)}
        </span>
      )
    case 'url': {
      const str = String(value)
      return (
        <span className="text-blue-500 text-xs truncate max-w-full block" title={str}>
          {str}
        </span>
      )
    }
    case 'select': {
      const str = String(value)
      const { bg, text } = tagColor(str)
      return (
        <span
          style={{
            backgroundColor: bg,
            color: text,
            padding: '1px 8px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 500,
            display: 'inline-block',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {str}
        </span>
      )
    }
    default:
      return <span className="text-gray-800 text-xs truncate">{String(value)}</span>
  }
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────

export function EditableCell({
  value,
  column,
  rowId,
  colId,
  onChange,
  onNavigate,
  onPaste,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>('')

  function startEdit() {
    setDraft(value == null ? '' : String(value))
    setEditing(true)
  }

  function commit(draft: string) {
    onChange(normalizeCellValue(draft, column.type))
    setEditing(false)
  }

  function commitAndNavigate(draft: string, dir: NavigateDir) {
    onChange(normalizeCellValue(draft, column.type))
    setEditing(false)
    // DOM 업데이트 후 포커스 이동
    setTimeout(() => onNavigate?.(dir), 0)
  }

  // ── 체크박스: 항상 인터랙티브 ────────────────────────────────
  if (column.type === 'checkbox') {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer focus:ring-1 focus:ring-blue-400"
          aria-label="체크박스"
        />
      </div>
    )
  }

  // ── 표시 모드 ─────────────────────────────────────────────────
  if (!editing) {
    return (
      <div
        tabIndex={0}
        data-cell-row={rowId}
        data-cell-col={colId}
        className="w-full h-full flex items-center overflow-hidden cursor-text outline-none focus:ring-1 focus:ring-blue-400 focus:ring-inset rounded-sm"
        onClick={startEdit}
        onPaste={(e) => {
          const text = e.clipboardData?.getData('text')
          if (text && onPaste) {
            e.preventDefault()
            onPaste(text)
          }
        }}
        onKeyDown={(e) => {
          switch (e.key) {
            case 'Enter':
            case 'F2':
              e.preventDefault()
              startEdit()
              break
            case 'Tab':
              e.preventDefault()
              onNavigate?.(e.shiftKey ? 'left' : 'tab')
              break
            case 'ArrowUp':
              e.preventDefault()
              onNavigate?.('up')
              break
            case 'ArrowDown':
              e.preventDefault()
              onNavigate?.('down')
              break
            case 'ArrowLeft':
              e.preventDefault()
              onNavigate?.('left')
              break
            case 'ArrowRight':
              e.preventDefault()
              onNavigate?.('right')
              break
          }
        }}
        role="gridcell"
        aria-label={`${column.name} 셀`}
      >
        <DisplayValue value={value} column={column} />
      </div>
    )
  }

  // ── 편집 모드: select ─────────────────────────────────────────
  if (column.type === 'select') {
    return (
      <select
        autoFocus
        value={String(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commitAndNavigate(draft, 'down') }
          if (e.key === 'Tab') { e.preventDefault(); commitAndNavigate(draft, e.shiftKey ? 'left' : 'tab') }
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-full h-full text-xs border-0 outline-none bg-transparent"
        style={{ background: 'transparent' }}
      >
        <option value="">-</option>
        {column.options?.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    )
  }

  // ── 편집 모드: input ──────────────────────────────────────────
  const inputType =
    column.type === 'date' ? 'date' :
    column.type === 'number' || column.type === 'currency' || column.type === 'percent' ? 'number' :
    'text'

  return (
    <input
      autoFocus
      type={inputType}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commitAndNavigate(draft, 'down') }
        if (e.key === 'Tab') { e.preventDefault(); commitAndNavigate(draft, e.shiftKey ? 'left' : 'tab') }
        if (e.key === 'Escape') setEditing(false)
      }}
      className="w-full h-full text-xs border-0 outline-none bg-transparent focus:ring-0 px-0"
      style={{ background: 'transparent', minWidth: 0 }}
    />
  )
}
