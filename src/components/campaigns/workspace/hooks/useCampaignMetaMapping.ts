'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { User } from 'firebase/auth'
import type {
  CampaignMetaInsightLevel,
  CampaignMetaMapping,
  CampaignMetaRefreshRequest,
  CampaignMetaRefreshResult,
} from '@/types'

// ── auth helper ───────────────────────────────────────────────────

async function authFetch(user: User, url: string, init: RequestInit = {}) {
  const token = await user.getIdToken()
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  })
}

// ── form state type (UI용) ────────────────────────────────────────

export interface MetaMappingFormState {
  mappingId?: string
  metaAccountId: string
  selectedLevels: CampaignMetaInsightLevel[]
  metaCampaignIds: string[]
  metaAdsetIds: string[]
  metaAdIds: string[]
  enabled: boolean
}

// ── hook ──────────────────────────────────────────────────────────

export function useCampaignMetaMapping(
  campaignId: string,
  onRefreshSuccess?: () => void
) {
  const { user } = useAuth()

  const [mappings, setMappings] = useState<CampaignMetaMapping[]>([])
  const [activeMappingId, setActiveMappingId] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshResult, setLastRefreshResult] = useState<CampaignMetaRefreshResult | null>(null)
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null)

  const activeMapping =
    mappings.find((m) => m.id === activeMappingId) ?? null

  const reloadMappings = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(user, `/api/campaigns/${campaignId}/meta/mapping`)
      const data = await res.json() as Record<string, unknown>
      if (!res.ok) throw new Error((data['error'] as string | undefined) ?? 'mapping을 불러올 수 없습니다.')
      const loaded = (data['mappings'] as CampaignMetaMapping[] | undefined) ?? []
      setMappings(loaded)
      if (loaded.length > 0) {
        setActiveMappingId((prev) => prev ?? loaded[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'mapping 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [campaignId, user])

  useEffect(() => {
    void reloadMappings()
  }, [reloadMappings])

  const saveMapping = useCallback(
    async (form: MetaMappingFormState): Promise<string | null> => {
      if (!user) return null
      setSaving(true)
      setError(null)
      try {
        const res = await authFetch(
          user,
          `/api/campaigns/${campaignId}/meta/mapping`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          }
        )
        const data = await res.json() as Record<string, unknown>
        if (!res.ok) throw new Error((data['error'] as string | undefined) ?? 'mapping 저장 실패')
        const newId = data['mappingId'] as string
        await reloadMappings()
        setActiveMappingId(newId)
        return newId
      } catch (err) {
        setError(err instanceof Error ? err.message : 'mapping 저장 실패')
        return null
      } finally {
        setSaving(false)
      }
    },
    [campaignId, user, reloadMappings]
  )

  const clearStatus = useCallback(() => {
    setLastRefreshResult(null)
    setError(null)
  }, [])

  const refreshMapping = useCallback(
    async (request: CampaignMetaRefreshRequest) => {
      if (!user) return
      setRefreshing(true)
      setError(null)
      try {
        const res = await authFetch(
          user,
          `/api/campaigns/${campaignId}/meta/refresh`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
          }
        )
        const data = await res.json() as Record<string, unknown>
        if (res.status === 429 && data['error'] === 'META_RATE_LIMIT') {
          const retryAfter = (data['retryAfterSeconds'] as number | undefined) ?? 60
          setRateLimitUntil(Date.now() + retryAfter * 1000)
          setError('Meta API 요청 제한에 도달했습니다. 잠시 후 다시 시도하세요.')
          return
        }
        if (!res.ok) {
          const base = (data['error'] as string | undefined) ?? 'refresh 실패'
          const detail = data['detail'] as string | undefined
          throw new Error(detail ? `${base}: ${detail}` : base)
        }
        setLastRefreshResult(data as unknown as CampaignMetaRefreshResult)
        onRefreshSuccess?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'refresh 실패')
      } finally {
        setRefreshing(false)
      }
    },
    [campaignId, user, onRefreshSuccess]
  )

  return {
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
    rateLimitUntil,
    clearStatus,
  }
}
