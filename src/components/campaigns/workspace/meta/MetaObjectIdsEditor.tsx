'use client'

import React, { useState } from 'react'

interface MetaObjectIdsEditorProps {
  label: string
  value: string[]
  placeholder?: string
  disabled?: boolean
  onChange: (next: string[]) => void
}

function parseIds(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\n,\s]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    ),
  ]
}

export function MetaObjectIdsEditor({
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: MetaObjectIdsEditorProps) {
  // 로컬 텍스트 상태 — 초기값만 props에서 받음 (key로 remount 시 리셋됨)
  const [text, setText] = useState(() => value.join('\n'))

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const raw = e.target.value
    setText(raw)
    onChange(parseIds(raw))
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 5,
      }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#5c6577' }}>{label}</label>
        {value.length > 0 && (
          <span style={{ fontSize: 11, color: '#3578f6', fontWeight: 700 }}>
            {value.length}개 선택됨
          </span>
        )}
      </div>
      <textarea
        value={text}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder ?? 'ID 입력 (줄바꿈 또는 쉼표 구분)'}
        rows={3}
        style={{
          width: '100%',
          padding: '7px 10px',
          border: '1px solid #d5dae5',
          borderRadius: 6,
          fontSize: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          lineHeight: 1.5,
          resize: 'vertical',
          color: '#253047',
          background: disabled ? '#f5f7fa' : '#fff',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
        onFocus={(e) => { if (!disabled) e.target.style.borderColor = '#3578f6' }}
        onBlur={(e) => { e.target.style.borderColor = '#d5dae5' }}
      />
    </div>
  )
}
