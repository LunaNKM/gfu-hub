'use client'

import React, { useEffect, useRef, useState } from 'react'
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
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      if (inputRef.current instanceof HTMLInputElement) inputRef.current.select()
    }
  }, [editing])

  const startEdit = () => {
    setDraft(value == null ? '' : String(value))
    setEditing(true)
  }

  const commit = (nextDraft = draft) => {
    onChange(normalizeCellValue(nextDraft, column.type))
    setEditing(false)
  }

  const commitAndNavigate = (dir: NavigateDir) => {
    onChange(normalizeCellValue(draft, column.type))
    setEditing(false)
    window.setTimeout(() => onNavigate?.(dir), 0)
  }

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

  if (!editing) {
    return (
      <div
        tabIndex={0}
        data-cell-row={rowId}
        data-cell-col={colId}
        className="flex h-full w-full cursor-text items-center overflow-hidden rounded-sm outline-none focus:ring-1 focus:ring-blue-400 focus:ring-inset"
        onMouseDown={(event) => {
          event.preventDefault()
          startEdit()
        }}
        onPaste={(event) => {
          const text = event.clipboardData?.getData('text')
          if (text && onPaste) {
            event.preventDefault()
            onPaste(text)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'F2') {
            event.preventDefault()
            startEdit()
          } else if (event.key === 'Tab') {
            event.preventDefault()
            onNavigate?.(event.shiftKey ? 'left' : 'tab')
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            onNavigate?.('up')
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            onNavigate?.('down')
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault()
            onNavigate?.('left')
          } else if (event.key === 'ArrowRight') {
            event.preventDefault()
            onNavigate?.('right')
          }
        }}
        role="gridcell"
        aria-label={`${column.name} 셀`}
      >
        <DisplayValue value={value} column={column} />
      </div>
    )
  }

  if (column.type === 'select') {
    return (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit()}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commitAndNavigate('down')
          } else if (event.key === 'Tab') {
            event.preventDefault()
            commitAndNavigate(event.shiftKey ? 'left' : 'tab')
          } else if (event.key === 'Escape') {
            setEditing(false)
          }
        }}
        className="h-full w-full border-0 bg-transparent text-xs outline-none"
      >
        <option value="">-</option>
        {column.options?.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
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
      type={inputType}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => commit()}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commitAndNavigate('down')
        } else if (event.key === 'Tab') {
          event.preventDefault()
          commitAndNavigate(event.shiftKey ? 'left' : 'tab')
        } else if (event.key === 'Escape') {
          setEditing(false)
        }
      }}
      className="h-full w-full min-w-0 border-0 bg-transparent px-0 text-xs outline-none focus:ring-0"
    />
  )
}

function DisplayValue({
  value,
  column,
}: {
  value: string | number | boolean | null
  column: CampaignDataColumn
}) {
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
    const { bg, text: textColor } = tagColor(text)
    return (
      <span
        style={{
          backgroundColor: bg,
          color: textColor,
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
        {text}
      </span>
    )
  }

  return <span className="truncate text-xs text-gray-800">{String(value)}</span>
}
