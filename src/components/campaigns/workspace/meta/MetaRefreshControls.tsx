'use client'

import React, { useState } from 'react'
import type { CampaignMetaInsightLevel, CampaignMetaRefreshResult } from '@/types'

// ── 날짜 헬퍼 ────────────────────────────────────────────────────

function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function defaultDates(): { dateStart: string; dateStop: string } {
  const today = new Date()
  const ago30 = new Date(today)
  ago30.setDate(today.getDate() - 30)
  return { dateStart: toDateStr(ago30), dateStop: toDateStr(today) }
}

function fmtFetchedAt(raw: string): string {
  try {
    return new Date(raw).toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return raw
  }
}

// ── 컴포넌트 ──────────────────────────────────────────────────────

interface MetaRefreshControlsProps {
  mappingId: string | undefined
  selectedLevels: CampaignMetaInsightLevel[]
  metaAccountId: string
  refreshing: boolean
  lastResult: CampaignMetaRefreshResult | null
  onRefresh: (params: {
    mappingId: string
    metaAccountId: string
    levels: CampaignMetaInsightLevel[]
    dateStart: string
    dateStop: string
  }) => void
}

export function MetaRefreshControls({
  mappingId,
  selectedLevels,
  metaAccountId,
  refreshing,
  lastResult,
  onRefresh,
}: MetaRefreshControlsProps) {
  const [dates, setDates] = useState(defaultDates)

  const canRefresh =
    !!mappingId &&
    selectedLevels.length > 0 &&
    metaAccountId.trim().length > 0 &&
    !refreshing

  function handleRefresh() {
    if (!canRefresh || !mappingId) return
    onRefresh({
      mappingId,
      metaAccountId,
      levels: selectedLevels,
      dateStart: dates.dateStart,
      dateStop: dates.dateStop,
    })
  }

  return (
    <div>
      {/* 날짜 범위 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>시작일</label>
          <input
            type="date"
            value={dates.dateStart}
            max={dates.dateStop}
            onChange={(e) => setDates((p) => ({ ...p, dateStart: e.target.value }))}
            disabled={refreshing}
            style={inputStyle(refreshing)}
          />
        </div>
        <div>
          <label style={labelStyle}>종료일</label>
          <input
            type="date"
            value={dates.dateStop}
            min={dates.dateStart}
            max={toDateStr(new Date())}
            onChange={(e) => setDates((p) => ({ ...p, dateStop: e.target.value }))}
            disabled={refreshing}
            style={inputStyle(refreshing)}
          />
        </div>
      </div>

      {/* 안내 */}
      {!canRefresh && !refreshing && (
        <p style={{ margin: '0 0 10px', color: '#b57a00', fontSize: 11 }}>
          새로고침하려면 mapping을 저장하고, level과 object ID가 최소 하나 이상 필요합니다.
        </p>
      )}

      {/* 버튼 */}
      <button
        type="button"
        onClick={handleRefresh}
        disabled={!canRefresh}
        style={{
          width: '100%',
          height: 34,
          border: 0,
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          cursor: canRefresh ? 'pointer' : 'not-allowed',
          background: canRefresh ? '#3578f6' : '#c8d5eb',
          color: '#fff',
          transition: 'background 0.15s',
        }}
      >
        {refreshing ? '새로고침 중...' : 'Meta 데이터 새로고침'}
      </button>

      {/* 결과 */}
      {lastResult ? (
        <div style={{
          marginTop: 12,
          padding: '10px 12px',
          border: '1px solid #d0eacb',
          borderRadius: 6,
          background: '#f2faf0',
          fontSize: 12,
        }}>
          <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#25703a' }}>새로고침 완료</p>
          <div style={{ display: 'grid', gap: 3, color: '#3a5042' }}>
            <span>가져온 row: <b>{lastResult.rawFetchedCount}</b></span>
            <span>저장 row: <b>{lastResult.upsertedCount}</b></span>
            <span>스킵 row: <b>{lastResult.skippedCount}</b></span>
            <span style={{ marginTop: 4, color: '#6b7a72', fontSize: 11 }}>
              갱신 시각: {fmtFetchedAt(lastResult.fetchedAt)}
            </span>
          </div>
        </div>
      ) : (
        <p style={{ marginTop: 10, color: '#8b95a7', fontSize: 11 }}>
          아직 새로고침 이력이 없습니다.
        </p>
      )}
    </div>
  )
}

// ── 스타일 헬퍼 ───────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: '#5c6577',
  marginBottom: 4,
}

function inputStyle(disabled: boolean): React.CSSProperties {
  return {
    width: '100%',
    height: 34,
    padding: '0 10px',
    border: '1px solid #d5dae5',
    borderRadius: 6,
    fontSize: 12,
    color: '#253047',
    background: disabled ? '#f5f7fa' : '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  }
}
