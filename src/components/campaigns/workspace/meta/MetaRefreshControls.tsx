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
  metaCampaignIds: string[]
  metaAdsetIds: string[]
  metaAdIds: string[]
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

// level별로 최소 1개의 object ID가 있는지 검사
function levelHasIds(
  levels: CampaignMetaInsightLevel[],
  campaignIds: string[],
  adsetIds: string[],
  adIds: string[],
): boolean {
  return levels.every((level) => {
    if (level === 'campaign') return campaignIds.length > 0
    if (level === 'adset')    return adsetIds.length > 0
    if (level === 'ad')       return adIds.length > 0
    return false
  })
}

// 누락된 level ID를 알려주는 안내 문구
function missingIdsHint(
  levels: CampaignMetaInsightLevel[],
  campaignIds: string[],
  adsetIds: string[],
  adIds: string[],
): string {
  const missing: string[] = []
  if (levels.includes('campaign') && campaignIds.length === 0) missing.push('Campaign ID')
  if (levels.includes('adset')    && adsetIds.length    === 0) missing.push('Ad Set ID')
  if (levels.includes('ad')       && adIds.length       === 0) missing.push('Ad ID')
  return missing.length > 0
    ? `누락된 Object ID: ${missing.join(', ')}`
    : ''
}

export function MetaRefreshControls({
  mappingId,
  selectedLevels,
  metaAccountId,
  metaCampaignIds,
  metaAdsetIds,
  metaAdIds,
  refreshing,
  lastResult,
  onRefresh,
}: MetaRefreshControlsProps) {
  const [dates, setDates] = useState(defaultDates)

  const idsValid = levelHasIds(selectedLevels, metaCampaignIds, metaAdsetIds, metaAdIds)
  const canRefresh =
    !!mappingId &&
    selectedLevels.length > 0 &&
    metaAccountId.trim().length > 0 &&
    idsValid &&
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
          {!mappingId
            ? 'mapping을 먼저 저장해 주세요.'
            : selectedLevels.length === 0
              ? '수집 Level을 하나 이상 선택해 주세요.'
              : !metaAccountId.trim()
                ? 'Meta Account ID를 입력해 주세요.'
                : missingIdsHint(selectedLevels, metaCampaignIds, metaAdsetIds, metaAdIds)
                  ? missingIdsHint(selectedLevels, metaCampaignIds, metaAdsetIds, metaAdIds)
                  : 'Object ID를 입력해 주세요.'
          }
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
