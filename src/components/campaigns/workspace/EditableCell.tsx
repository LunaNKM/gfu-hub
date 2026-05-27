'use client'

import React, { useState } from 'react'
import { CampaignDataColumn } from '@/types'
import { normalizeCellValue, tagColor } from './workspaceUtils'

interface EditableCellProps {
  value: string | number | boolean | null
  column: CampaignDataColumn
  onChange: (value: string | number | boolean | null) => void
}

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

export function EditableCell({ value, column, onChange }: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>('')

  // ── 체크박스: 항상 인터랙티브 ─────────────────────────────────
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
        className="w-full h-full flex items-center overflow-hidden cursor-text"
        onClick={() => {
          setDraft(value == null ? '' : String(value))
          setEditing(true)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'F2') {
            setDraft(value == null ? '' : String(value))
            setEditing(true)
            e.preventDefault()
          }
        }}
        aria-label={`${column.name} 셀 편집`}
      >
        <DisplayValue value={value} column={column} />
      </div>
    )
  }

  // ── 편집 모드: select ──────────────────────────────────────────
  if (column.type === 'select') {
    return (
      <select
        autoFocus
        value={String(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onChange(normalizeCellValue(draft, column.type))
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onChange(normalizeCellValue(draft, column.type))
            setEditing(false)
          }
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-full h-full text-xs border-0 outline-none bg-transparent"
        style={{ background: 'transparent' }}
      >
        <option value="">-</option>
        {column.options?.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }

  // ── 편집 모드: input ──────────────────────────────────────────
  const inputType =
    column.type === 'date'
      ? 'date'
      : column.type === 'number' || column.type === 'currency' || column.type === 'percent'
      ? 'number'
      : 'text'

  return (
    <input
      autoFocus
      type={inputType}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        onChange(normalizeCellValue(draft, column.type))
        setEditing(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onChange(normalizeCellValue(draft, column.type))
          setEditing(false)
        }
        if (e.key === 'Escape') setEditing(false)
      }}
      className="w-full h-full text-xs border-0 outline-none bg-transparent focus:ring-0 px-0"
      style={{ background: 'transparent', minWidth: 0 }}
    />
  )
}
