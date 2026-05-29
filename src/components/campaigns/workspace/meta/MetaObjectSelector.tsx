'use client'

import React, { useEffect, useState } from 'react'
import { ChevronRight, ChevronDown, RefreshCw } from 'lucide-react'
import type { CampaignMetaInsightLevel } from '@/types/campaignMeta'
import { useMetaObjects, normalizeMetaAccountId } from '../hooks/useMetaObjects'

// ── Props ─────────────────────────────────────────────────────────

interface MetaObjectSelectorProps {
  metaAccountId: string
  selectedLevels: CampaignMetaInsightLevel[]
  selectedCampaignIds: string[]
  selectedAdsetIds: string[]
  selectedAdIds: string[]
  onChange: (next: {
    metaCampaignIds: string[]
    metaAdsetIds: string[]
    metaAdIds: string[]
  }) => void
}

// ── 헬퍼 ──────────────────────────────────────────────────────────

function toggle(arr: string[], id: string): string[] {
  return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]
}

// ── 상태 뱃지 ─────────────────────────────────────────────────────

function StatusBadge({
  status,
  effectiveStatus,
}: {
  status?: string
  effectiveStatus?: string
}) {
  const s = effectiveStatus ?? status
  if (!s) return null
  const active = s === 'ACTIVE'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 16,
        padding: '0 5px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        flexShrink: 0,
        background: active ? '#e8f8f1' : '#f0f3f7',
        color: active ? '#087a57' : '#7a8497',
      }}
    >
      {s}
    </span>
  )
}

// ── 컴포넌트 ──────────────────────────────────────────────────────

export function MetaObjectSelector({
  metaAccountId,
  selectedLevels,
  selectedCampaignIds,
  selectedAdsetIds,
  selectedAdIds,
  onChange,
}: MetaObjectSelectorProps) {
  const { loading, error, objects, objectsAccountId, reload } = useMetaObjects()
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(
    new Set()
  )
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set())

  // metaAccountId가 바뀌면:
  // - 이전 계정의 펼침 상태를 초기화
  // - 새 계정 목록 로드 (hook 내부에서 stale data 즉시 제거됨)
  useEffect(() => {
    setExpandedCampaigns(new Set())
    setExpandedAdsets(new Set())
    void reload(metaAccountId)
  }, [metaAccountId, reload])

  // 현재 metaAccountId에 대한 objects가 성공적으로 로드되었는지 확인
  // loading 중이거나 에러 상태이거나 다른 계정의 objects면 false
  const isCurrentAccountLoaded =
    !loading &&
    error === null &&
    objectsAccountId !== null &&
    objectsAccountId === normalizeMetaAccountId(metaAccountId)

  // isCurrentAccountLoaded가 아닌 경우 목록을 비워 stale data 노출을 차단
  const campaigns = isCurrentAccountLoaded ? (objects?.campaigns ?? []) : []
  const adsets = isCurrentAccountLoaded ? (objects?.adsets ?? []) : []
  const ads = isCurrentAccountLoaded ? (objects?.ads ?? []) : []

  const campaignEnabled = selectedLevels.includes('campaign')
  const adsetEnabled = selectedLevels.includes('adset')
  const adEnabled = selectedLevels.includes('ad')

  // orphanCount는 현재 계정 목록이 성공적으로 로드된 경우에만 계산
  const knownCampaignIds = new Set(campaigns.map((c) => c.id))
  const knownAdsetIds = new Set(adsets.map((a) => a.id))
  const knownAdIds = new Set(ads.map((a) => a.id))
  const orphanCount = isCurrentAccountLoaded
    ? selectedCampaignIds.filter((id) => !knownCampaignIds.has(id)).length +
      selectedAdsetIds.filter((id) => !knownAdsetIds.has(id)).length +
      selectedAdIds.filter((id) => !knownAdIds.has(id)).length
    : 0

  function toggleCampaignExpand(id: string) {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAdsetExpand(id: string) {
    setExpandedAdsets((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const hasAccountId = metaAccountId.trim().length > 0

  return (
    <div>
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: '#5c6577' }}>
          Meta Objects
        </span>
        <button
          type="button"
          onClick={() => {
            void reload(metaAccountId, true)
          }}
          disabled={loading || !hasAccountId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            height: 24,
            padding: '0 8px',
            border: '1px solid #d5dae5',
            borderRadius: 5,
            background: '#fff',
            cursor: loading || !hasAccountId ? 'not-allowed' : 'pointer',
            fontSize: 11,
            color: loading || !hasAccountId ? '#b0b9c9' : '#344054',
          }}
        >
          <RefreshCw size={11} style={{ flexShrink: 0 }} />
          목록 새로고침
        </button>
      </div>

      {/* ── 상태별 콘텐츠 ──────────────────────────────────────────── */}

      {/* accountId 없음 */}
      {!hasAccountId && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 6,
            background: '#f8fafc',
            border: '1px solid #e5e9f0',
            color: '#8b95a7',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          Meta Account ID를 입력하면 캠페인 목록을 불러올 수 있습니다.
        </div>
      )}

      {/* 로딩 중 — stale list 절대 표시하지 않음 */}
      {hasAccountId && loading && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 6,
            background: '#f8fafc',
            border: '1px solid #e5e9f0',
            color: '#8b95a7',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <RefreshCw size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
          Meta 목록을 불러오는 중...
        </div>
      )}

      {/* 에러 — stale list 표시하지 않고 에러만 보여줌 */}
      {hasAccountId && !loading && error !== null && (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            background: '#fff5f5',
            border: '1px solid #fbc8c8',
            color: '#c0392b',
            fontSize: 11,
            lineHeight: 1.5,
            wordBreak: 'break-all',
          }}
        >
          {error}
        </div>
      )}

      {/* 빈 상태 — 현재 계정 목록이 로드됐지만 캠페인이 없음 */}
      {isCurrentAccountLoaded && campaigns.length === 0 && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 6,
            background: '#f8fafc',
            border: '1px solid #e5e9f0',
            color: '#8b95a7',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          연결된 캠페인이 없습니다.
        </div>
      )}

      {/* 목록 — 현재 계정 목록이 로드되고 캠페인이 있을 때만 표시 */}
      {isCurrentAccountLoaded && campaigns.length > 0 && (
        <div
          style={{
            border: '1px solid #e5e9f0',
            borderRadius: 6,
            overflow: 'hidden',
            maxHeight: 360,
            overflowY: 'auto',
          }}
        >
          {campaigns.map((campaign, ci) => {
            const campaignAdsets = adsets.filter(
              (a) => a.campaignId === campaign.id
            )
            const isExpanded = expandedCampaigns.has(campaign.id)
            const isChecked = selectedCampaignIds.includes(campaign.id)
            const hasChildren = campaignAdsets.length > 0

            return (
              <div
                key={campaign.id}
                style={{
                  borderBottom:
                    ci < campaigns.length - 1 ? '1px solid #eef1f5' : undefined,
                }}
              >
                {/* Campaign row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 10px',
                    background: '#fff',
                    minWidth: 0,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleCampaignExpand(campaign.id)}
                    style={{
                      flexShrink: 0,
                      border: 0,
                      background: 'transparent',
                      padding: 0,
                      cursor: hasChildren ? 'pointer' : 'default',
                      color: hasChildren ? '#7a8497' : '#d5dae5',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    aria-label={isExpanded ? '접기' : '펼치기'}
                  >
                    {isExpanded ? (
                      <ChevronDown size={13} />
                    ) : (
                      <ChevronRight size={13} />
                    )}
                  </button>

                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={!campaignEnabled}
                    onChange={() => {
                      if (!campaignEnabled) return
                      const adding = !isChecked
                      const newCampaignIds = toggle(selectedCampaignIds, campaign.id)
                      if (adding) {
                        // 하위 adset/ad 자동 선택 (해당 level이 활성화된 경우에만)
                        const newAdsetIds = adsetEnabled
                          ? [...new Set([...selectedAdsetIds, ...campaignAdsets.map((a) => a.id)])]
                          : selectedAdsetIds
                        const cascadeAdIds = adEnabled
                          ? campaignAdsets.flatMap((a) =>
                              ads.filter((ad) => ad.adsetId === a.id).map((ad) => ad.id)
                            )
                          : []
                        const newAdIds = adEnabled
                          ? [...new Set([...selectedAdIds, ...cascadeAdIds])]
                          : selectedAdIds
                        onChange({ metaCampaignIds: newCampaignIds, metaAdsetIds: newAdsetIds, metaAdIds: newAdIds })
                      } else {
                        // 하위 adset/ad 선택 해제
                        const childAdsetIds = new Set(campaignAdsets.map((a) => a.id))
                        const childAdIds = new Set(
                          campaignAdsets.flatMap((a) =>
                            ads.filter((ad) => ad.adsetId === a.id).map((ad) => ad.id)
                          )
                        )
                        onChange({
                          metaCampaignIds: newCampaignIds,
                          metaAdsetIds: selectedAdsetIds.filter((id) => !childAdsetIds.has(id)),
                          metaAdIds: selectedAdIds.filter((id) => !childAdIds.has(id)),
                        })
                      }
                    }}
                    style={{
                      flexShrink: 0,
                      cursor: campaignEnabled ? 'pointer' : 'default',
                    }}
                  />

                  <span
                    style={{
                      flex: 1,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#1b2638',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                    }}
                  >
                    {campaign.name}
                  </span>
                  <StatusBadge
                    status={campaign.status}
                    effectiveStatus={campaign.effectiveStatus}
                  />
                </div>

                {/* Ad Set rows */}
                {isExpanded &&
                  campaignAdsets.map((adset) => {
                    const adsetAds = ads.filter((a) => a.adsetId === adset.id)
                    const isAdsetExpanded = expandedAdsets.has(adset.id)
                    const isAdsetChecked = selectedAdsetIds.includes(adset.id)
                    const hasAds = adsetAds.length > 0

                    return (
                      <div key={adset.id}>
                        {/* Adset row */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 10px 6px 28px',
                            background: '#fafbfc',
                            borderTop: '1px solid #eef1f5',
                            minWidth: 0,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => toggleAdsetExpand(adset.id)}
                            style={{
                              flexShrink: 0,
                              border: 0,
                              background: 'transparent',
                              padding: 0,
                              cursor: hasAds ? 'pointer' : 'default',
                              color: hasAds ? '#7a8497' : '#d5dae5',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            aria-label={isAdsetExpanded ? '접기' : '펼치기'}
                          >
                            {isAdsetExpanded ? (
                              <ChevronDown size={12} />
                            ) : (
                              <ChevronRight size={12} />
                            )}
                          </button>

                          <input
                            type="checkbox"
                            checked={isAdsetChecked}
                            disabled={!adsetEnabled}
                            onChange={() => {
                              if (!adsetEnabled) return
                              const adding = !isAdsetChecked
                              const newAdsetIds = toggle(selectedAdsetIds, adset.id)
                              if (adding) {
                                // 하위 ad 자동 선택 (ad level이 활성화된 경우에만)
                                const newAdIds = adEnabled
                                  ? [...new Set([...selectedAdIds, ...adsetAds.map((ad) => ad.id)])]
                                  : selectedAdIds
                                onChange({ metaCampaignIds: selectedCampaignIds, metaAdsetIds: newAdsetIds, metaAdIds: newAdIds })
                              } else {
                                // 하위 ad 선택 해제
                                const childAdIds = new Set(adsetAds.map((ad) => ad.id))
                                onChange({
                                  metaCampaignIds: selectedCampaignIds,
                                  metaAdsetIds: newAdsetIds,
                                  metaAdIds: selectedAdIds.filter((id) => !childAdIds.has(id)),
                                })
                              }
                            }}
                            style={{
                              flexShrink: 0,
                              cursor: adsetEnabled ? 'pointer' : 'default',
                            }}
                          />

                          <span
                            style={{
                              flex: 1,
                              fontSize: 12,
                              color: '#344054',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              minWidth: 0,
                            }}
                          >
                            {adset.name}
                          </span>
                          <StatusBadge
                            status={adset.status}
                            effectiveStatus={adset.effectiveStatus}
                          />
                        </div>

                        {/* Ad rows */}
                        {isAdsetExpanded &&
                          adsetAds.map((ad) => {
                            const isAdChecked = selectedAdIds.includes(ad.id)
                            return (
                              <div
                                key={ad.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '5px 10px 5px 46px',
                                  background: '#f8f9fb',
                                  borderTop: '1px solid #eef1f5',
                                  minWidth: 0,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isAdChecked}
                                  disabled={!adEnabled}
                                  onChange={() => {
                                    if (!adEnabled) return
                                    onChange({
                                      metaCampaignIds: selectedCampaignIds,
                                      metaAdsetIds: selectedAdsetIds,
                                      metaAdIds: toggle(selectedAdIds, ad.id),
                                    })
                                  }}
                                  style={{
                                    flexShrink: 0,
                                    cursor: adEnabled ? 'pointer' : 'default',
                                  }}
                                />
                                <span
                                  style={{
                                    flex: 1,
                                    fontSize: 11,
                                    color: '#475467',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    minWidth: 0,
                                  }}
                                >
                                  {ad.name}
                                </span>
                                <StatusBadge
                                  status={ad.status}
                                  effectiveStatus={ad.effectiveStatus}
                                />
                              </div>
                            )
                          })}
                      </div>
                    )
                  })}
              </div>
            )
          })}
        </div>
      )}

      {/* 현재 계정 목록에 없는 선택 ID 안내 */}
      {orphanCount > 0 && (
        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#8b95a7' }}>
          현재 계정 목록에서 찾을 수 없는 선택 ID {orphanCount}개
        </p>
      )}
    </div>
  )
}
