'use client'

import React, { useEffect, useState } from 'react'
import type { CampaignMetaInsightLevel } from '@/types'
import { useCampaignMetaMapping, type MetaMappingFormState } from '../hooks/useCampaignMetaMapping'
import { MetaObjectSelector } from './MetaObjectSelector'
import { MetaRefreshControls } from './MetaRefreshControls'

// ── 상수 ─────────────────────────────────────────────────────────

const LEVELS: { value: CampaignMetaInsightLevel; label: string }[] = [
  { value: 'campaign', label: 'Campaign' },
  { value: 'adset',    label: 'Ad Set' },
  { value: 'ad',       label: 'Ad' },
]

// ── 빈 폼 ────────────────────────────────────────────────────────

function emptyForm(): MetaMappingFormState {
  return {
    metaAccountId: '',
    selectedLevels: ['campaign'],
    metaCampaignIds: [],
    metaAdsetIds: [],
    metaAdIds: [],
    enabled: true,
  }
}

// ── props ─────────────────────────────────────────────────────────

interface MetaMappingPanelProps {
  campaignId: string
  isOpen: boolean
  onClose: () => void
  onRefreshSuccess: () => void
}

// ── 컴포넌트 ─────────────────────────────────────────────────────

export function MetaMappingPanel({
  campaignId,
  isOpen,
  onClose,
  onRefreshSuccess,
}: MetaMappingPanelProps) {
  const {
    mappings,
    activeMapping,
    activeMappingId,
    setActiveMappingId,
    loading,
    saving,
    refreshing,
    error,
    saveMapping,
    refreshMapping,
    reloadMappings,
    lastRefreshResult,
    clearStatus,
  } = useCampaignMetaMapping(campaignId, onRefreshSuccess)

  const [form, setForm] = useState<MetaMappingFormState>(emptyForm)
  // form key: mapping이 바뀌면 id editors remount
  const [formKey, setFormKey] = useState(0)

  // 선택된 mapping → form 동기화 (activeMapping이 null이면 새 Mapping 모드이므로 덮어쓰지 않음)
  useEffect(() => {
    if (!activeMapping) return
    setForm({
      mappingId: activeMapping.id,
      metaAccountId: activeMapping.metaAccountId ?? '',
      selectedLevels: activeMapping.selectedLevels ?? ['campaign'],
      metaCampaignIds: activeMapping.metaCampaignIds ?? [],
      metaAdsetIds: activeMapping.metaAdsetIds ?? [],
      metaAdIds: activeMapping.metaAdIds ?? [],
      enabled: activeMapping.enabled !== false,
    })
    setFormKey((k) => k + 1)
  }, [activeMapping]) // eslint-disable-line react-hooks/exhaustive-deps

  // 패널 열릴 때 mappings 재조회
  useEffect(() => {
    if (isOpen) void reloadMappings()
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleLevel(level: CampaignMetaInsightLevel) {
    setForm((prev) => ({
      ...prev,
      selectedLevels: prev.selectedLevels.includes(level)
        ? prev.selectedLevels.filter((l) => l !== level)
        : [...prev.selectedLevels, level],
    }))
  }

  function handleCreateNewMapping() {
    setActiveMappingId(undefined)
    setForm(emptyForm())
    setFormKey((k) => k + 1)
    clearStatus()
  }

  function handleSelectMapping(id: string) {
    setActiveMappingId(id)
    clearStatus()
  }

  async function handleSave() {
    await saveMapping(form)
  }

  function handleRefresh(params: {
    mappingId: string
    metaAccountId: string
    levels: CampaignMetaInsightLevel[]
    dateStart: string
    dateStop: string
  }) {
    void refreshMapping({
      mappingId: params.mappingId,
      metaAccountId: params.metaAccountId,
      levels: params.levels,
      dateStart: params.dateStart,
      dateStop: params.dateStop,
    })
  }

  if (!isOpen) return null

  return (
    <>
      {/* 오버레이 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(16, 24, 40, 0.18)',
          zIndex: 200,
        }}
      />

      {/* 패널 */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 440,
        height: '100vh',
        background: '#fff',
        borderLeft: '1px solid #e5e9f0',
        zIndex: 201,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 20px rgba(16,24,40,.08)',
      }}>

        {/* ── 헤더 ──────────────────────────────────────────── */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid #e5e9f0',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#172033' }}>
              Meta 설정
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#8b95a7', lineHeight: 1.4 }}>
              앱 캠페인과 Meta 캠페인/광고세트/광고를 연결합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              border: 0,
              borderRadius: 6,
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 16,
              color: '#8b95a7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* ── 콘텐츠 ────────────────────────────────────────── */}
        <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* 에러 */}
          {error && (
            <div style={{
              padding: '9px 12px',
              border: '1px solid #fbc8c8',
              borderRadius: 6,
              background: '#fff5f5',
              color: '#c0392b',
              fontSize: 12,
              lineHeight: 1.5,
              wordBreak: 'break-all',
            }}>
              {error}
            </div>
          )}

          {/* Mapping 선택 드롭다운 (저장된 mapping이 1개 이상이면 표시) */}
          {mappings.length >= 1 && (
            <div>
              <label style={labelSt}>저장된 Mapping</label>
              <select
                value={activeMappingId ?? ''}
                onChange={(e) => {
                  const val = e.target.value
                  if (val === '') {
                    handleCreateNewMapping()
                  } else {
                    handleSelectMapping(val)
                  }
                }}
                style={selectSt}
              >
                {mappings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.metaAccountId} — {m.selectedLevels.join(', ')}
                  </option>
                ))}
                <option value="">+ 새 Mapping 추가</option>
              </select>
            </div>
          )}

          {/* 빈 상태 안내 */}
          {!loading && mappings.length === 0 && (
            <div style={{
              padding: '10px 12px',
              border: '1px solid #e5e9f0',
              borderRadius: 6,
              background: '#f8fafc',
              color: '#6c7587',
              fontSize: 12,
              lineHeight: 1.5,
            }}>
              아직 연결된 Meta mapping이 없습니다. Meta Account ID와 object ID를 입력해 저장하세요.
            </div>
          )}

          {/* ── Section 1: 기본 정보 ─────────────────────────── */}
          <Section title="기본 정보">
            <div>
              <label style={labelSt}>Meta Account ID</label>
              <input
                type="text"
                value={form.metaAccountId}
                onChange={(e) => setForm((p) => ({ ...p, metaAccountId: e.target.value }))}
                placeholder="act_XXXXXXXXXX"
                style={inputSt(false)}
                onFocus={(e) => { e.target.style.borderColor = '#3578f6' }}
                onBlur={(e) => { e.target.style.borderColor = '#d5dae5' }}
              />
            </div>

            {/* enabled toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="meta-mapping-enabled"
                checked={form.enabled}
                onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
                style={{ width: 14, height: 14, cursor: 'pointer' }}
              />
              <label
                htmlFor="meta-mapping-enabled"
                style={{ fontSize: 12, color: '#344054', cursor: 'pointer' }}
              >
                Mapping 활성화
              </label>
            </div>
          </Section>

          {/* ── Section 2: Level 선택 ────────────────────────── */}
          <Section title="수집 Level">
            <div style={{ display: 'flex', gap: 10 }}>
              {LEVELS.map(({ value, label }) => {
                const checked = form.selectedLevels.includes(value)
                return (
                  <label
                    key={value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      cursor: 'pointer',
                      fontSize: 12,
                      color: '#344054',
                      padding: '5px 10px',
                      border: `1px solid ${checked ? '#3578f6' : '#d5dae5'}`,
                      borderRadius: 6,
                      background: checked ? '#eef4ff' : '#fff',
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleLevel(value)}
                      style={{ display: 'none' }}
                    />
                    {label}
                  </label>
                )
              })}
            </div>
          </Section>

          {/* ── Section 3: Object 선택 ──────────────────────────── */}
          <Section title="Meta Object 선택">
            {form.metaAccountId.trim() ? (
              <MetaObjectSelector
                key={`selector-${formKey}`}
                metaAccountId={form.metaAccountId}
                selectedLevels={form.selectedLevels}
                selectedCampaignIds={form.metaCampaignIds}
                selectedAdsetIds={form.metaAdsetIds}
                selectedAdIds={form.metaAdIds}
                onChange={(next) =>
                  setForm((p) => ({
                    ...p,
                    metaCampaignIds: next.metaCampaignIds,
                    metaAdsetIds: next.metaAdsetIds,
                    metaAdIds: next.metaAdIds,
                  }))
                }
              />
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: '#8b95a7', lineHeight: 1.5 }}>
                Meta Account ID를 입력하면 캠페인 목록을 불러올 수 있습니다.
              </p>
            )}
          </Section>

          {/* ── 저장 버튼 ───────────────────────────────────── */}
          <button
            type="button"
            onClick={() => { void handleSave() }}
            disabled={saving || !form.metaAccountId.trim() || form.selectedLevels.length === 0}
            style={{
              height: 36,
              border: 0,
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              cursor: saving || !form.metaAccountId.trim() ? 'not-allowed' : 'pointer',
              background: saving || !form.metaAccountId.trim() ? '#c8d5eb' : '#3578f6',
              color: '#fff',
            }}
          >
            {saving ? '저장 중...' : 'mapping 저장'}
          </button>

          {/* ── Section 4: 새로고침 ──────────────────────────── */}
          <Section title="Meta 데이터 새로고침">
            <MetaRefreshControls
              mappingId={form.mappingId}
              selectedLevels={form.selectedLevels}
              metaAccountId={form.metaAccountId}
              metaCampaignIds={form.metaCampaignIds}
              metaAdsetIds={form.metaAdsetIds}
              metaAdIds={form.metaAdIds}
              refreshing={refreshing}
              lastResult={lastRefreshResult}
              onRefresh={handleRefresh}
            />
          </Section>

          {/* ── 안내 문구 ────────────────────────────────────── */}
          <div style={{
            padding: '10px 12px',
            border: '1px solid #e5e9f0',
            borderRadius: 6,
            background: '#f8fafc',
          }}>
            <p style={{ margin: 0, fontSize: 11, color: '#6c7587', lineHeight: 1.6 }}>
              Meta 성과 데이터는 직접 수정되지 않고, API snapshot으로 저장됩니다.<br />
              같은 날짜/object/level 데이터는 upsert로 자동 갱신됩니다.
            </p>
          </div>

        </div>
      </div>
    </>
  )
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{
        margin: '0 0 10px',
        fontSize: 11,
        fontWeight: 800,
        color: '#5c6577',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  )
}

// ── 스타일 상수 ───────────────────────────────────────────────────

const labelSt: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: '#5c6577',
  marginBottom: 5,
}

function inputSt(disabled: boolean): React.CSSProperties {
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
    transition: 'border-color 0.15s',
  }
}

const selectSt: React.CSSProperties = {
  width: '100%',
  height: 34,
  padding: '0 10px',
  border: '1px solid #d5dae5',
  borderRadius: 6,
  fontSize: 12,
  color: '#253047',
  background: '#fff',
  outline: 'none',
  cursor: 'pointer',
}
