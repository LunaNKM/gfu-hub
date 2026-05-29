'use client'

import React, { useState } from 'react'
import type {
  CampaignMetaInsightBreakdownType,
  CampaignMetaInsightLevel,
  CampaignMetaRefreshResult,
} from '@/types'

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
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return raw
  }
}

const LEVEL_LABELS: Record<CampaignMetaInsightLevel, string> = {
  campaign: 'Campaign',
  adset: 'Ad Set',
  ad: 'Ad',
}

function getRefreshableLevels(
  selectedLevels: CampaignMetaInsightLevel[],
  campaignIds: string[],
  adsetIds: string[],
  adIds: string[],
): CampaignMetaInsightLevel[] {
  const levels: CampaignMetaInsightLevel[] = []
  if (selectedLevels.includes('campaign') && campaignIds.length > 0) levels.push('campaign')
  if (selectedLevels.includes('adset') && adsetIds.length > 0) levels.push('adset')
  if (selectedLevels.includes('ad') && adIds.length > 0) levels.push('ad')
  return levels
}

interface MetaRefreshControlsProps {
  mappingId: string | undefined
  selectedLevels: CampaignMetaInsightLevel[]
  metaAccountId: string
  metaCampaignIds: string[]
  metaAdsetIds: string[]
  metaAdIds: string[]
  refreshing: boolean
  refreshPhase?: 'idle' | 'fetching' | 'reloading'
  lastResult: CampaignMetaRefreshResult | null
  rateLimitUntil?: number | null
  onRefresh: (params: {
    mappingId: string
    metaAccountId: string
    levels: CampaignMetaInsightLevel[]
    dateStart: string
    dateStop: string
    breakdowns?: CampaignMetaInsightBreakdownType[]
  }) => void
}

export function MetaRefreshControls({
  mappingId,
  selectedLevels,
  metaAccountId,
  metaCampaignIds,
  metaAdsetIds,
  metaAdIds,
  refreshing,
  refreshPhase = 'idle',
  lastResult,
  rateLimitUntil,
  onRefresh,
}: MetaRefreshControlsProps) {
  const [dates, setDates] = useState(defaultDates)
  const [withBreakdowns, setWithBreakdowns] = useState(false)

  const effectiveRefreshLevels = getRefreshableLevels(
    selectedLevels,
    metaCampaignIds,
    metaAdsetIds,
    metaAdIds
  )
  const excludedLevels = selectedLevels.filter(
    (level) => !effectiveRefreshLevels.includes(level)
  )
  const isRateLimited = !!rateLimitUntil && Date.now() < rateLimitUntil

  const canRefresh =
    !!mappingId &&
    metaAccountId.trim().length > 0 &&
    effectiveRefreshLevels.length > 0 &&
    !refreshing &&
    !isRateLimited

  function handleRefresh() {
    if (!canRefresh || !mappingId) return
    onRefresh({
      mappingId,
      metaAccountId,
      levels: effectiveRefreshLevels,
      dateStart: dates.dateStart,
      dateStop: dates.dateStop,
      breakdowns: withBreakdowns ? ['age_gender', 'placement', 'hourly'] : undefined,
    })
  }

  const selectionParts: string[] = []
  if (selectedLevels.includes('campaign')) selectionParts.push(`Campaign ${metaCampaignIds.length}개`)
  if (selectedLevels.includes('adset')) selectionParts.push(`Ad Set ${metaAdsetIds.length}개`)
  if (selectedLevels.includes('ad')) selectionParts.push(`Ad ${metaAdIds.length}개`)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>시작일</label>
          <input
            type="date"
            value={dates.dateStart}
            max={dates.dateStop}
            onChange={(e) => setDates((prev) => ({ ...prev, dateStart: e.target.value }))}
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
            onChange={(e) => setDates((prev) => ({ ...prev, dateStop: e.target.value }))}
            disabled={refreshing}
            style={inputStyle(refreshing)}
          />
        </div>
      </div>

      {selectionParts.length > 0 && (
        <p style={{ margin: '0 0 8px', fontSize: 11, color: '#6c7587' }}>
          선택됨: {selectionParts.join(' · ')}
        </p>
      )}

      {!canRefresh && !refreshing && (
        <p style={{ margin: '0 0 10px', color: '#b57a00', fontSize: 11, lineHeight: 1.5 }}>
          {!mappingId
            ? 'mapping을 먼저 저장한 후 새로고침할 수 있습니다.'
            : !metaAccountId.trim()
              ? 'Meta Account ID를 입력해 주세요.'
              : isRateLimited
                ? 'Meta API 요청 제한으로 잠시 후 다시 시도해야 합니다.'
                : '새로고침할 항목이 없습니다. 수집 Level을 켜고 Meta Object를 선택해 주세요.'}
        </p>
      )}

      {canRefresh && excludedLevels.length > 0 && (
        <p style={{ margin: '0 0 10px', fontSize: 11, color: '#6c7587', lineHeight: 1.5 }}>
          이번 새로고침 대상: {effectiveRefreshLevels.map((level) => LEVEL_LABELS[level]).join(', ')}
          <br />
          제외됨(선택 없음): {excludedLevels.map((level) => LEVEL_LABELS[level]).join(', ')}
        </p>
      )}

      {isRateLimited && (
        <p style={{ margin: '0 0 10px', padding: '8px 10px', borderRadius: 6, background: '#fff8ec', border: '1px solid #ffd98a', color: '#b57a00', fontSize: 11, lineHeight: 1.5 }}>
          Meta API 요청 제한에 도달했습니다. 잠시 후 다시 시도하세요.
        </p>
      )}

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: withBreakdowns ? 6 : 10, cursor: refreshing || isRateLimited ? 'not-allowed' : 'pointer' }}>
        <input
          type="checkbox"
          checked={withBreakdowns}
          disabled={refreshing || isRateLimited}
          onChange={(e) => setWithBreakdowns(e.target.checked)}
          style={{ cursor: refreshing || isRateLimited ? 'not-allowed' : 'pointer', marginTop: 1 }}
        />
        <span style={{ fontSize: 11, color: '#5c6577', lineHeight: 1.4 }}>
          오디언스/게재위치/시간대 상세 데이터도 수집
          <span style={{ marginLeft: 4, color: '#98a2b3', fontSize: 10 }}>(API 호출 증가)</span>
        </span>
      </label>
      <p style={{ margin: '0 0 10px', fontSize: 10, color: '#7a8497', paddingLeft: 20, lineHeight: 1.5 }}>
        {withBreakdowns
          ? '상세 분석 탭에 필요한 breakdown 데이터까지 함께 수집합니다. 시간이 더 걸릴 수 있습니다.'
          : '기본 성과만 빠르게 수집합니다.'}
      </p>

      {refreshing && (
        <p style={{ margin: '0 0 8px', fontSize: 11, color: '#2467d6', lineHeight: 1.5 }}>
          {refreshPhase === 'reloading'
            ? '저장된 snapshot으로 대시보드를 갱신 중입니다.'
            : 'Meta API에서 성과 데이터를 수집 중입니다.'}
        </p>
      )}

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
        {refreshing
          ? (refreshPhase === 'reloading' ? '대시보드 갱신 중...' : '데이터 수집 중...')
          : 'Meta 데이터 새로고침'}
      </button>

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
