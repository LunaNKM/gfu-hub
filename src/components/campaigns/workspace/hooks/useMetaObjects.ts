'use client'

import { useCallback, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { User } from 'firebase/auth'
import type { MetaObjectsResponse } from '@/types/campaignMeta'
import { normalizeMetaAdAccountId } from '@/lib/campaigns/metaAccount'

export { normalizeMetaAdAccountId as normalizeMetaAccountId }

const CACHE_TTL_MS = 5 * 60 * 1000
const COOLDOWN_MS = 60 * 1000

const objectsCache = new Map<string, { data: MetaObjectsResponse; fetchedAt: number }>()
const cooldownUntilMap = new Map<string, number>()
const inFlight = new Set<string>()

async function authFetch(user: User, url: string): Promise<Response> {
  const token = await user.getIdToken()
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

function isRateLimitError(detail: string | undefined): boolean {
  if (!detail) return false
  return detail.includes('[17/') || detail.includes('[17]') || detail.includes('2446079')
}

export function useMetaObjects() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [objects, setObjects] = useState<MetaObjectsResponse | null>(null)
  const [objectsAccountId, setObjectsAccountId] = useState<string | null>(null)

  const requestSeqRef = useRef(0)

  const reload = useCallback(
    async (metaAccountId: string, force = false) => {
      const normalized = normalizeMetaAdAccountId(metaAccountId)

      if (!normalized) {
        setObjects(null)
        setObjectsAccountId(null)
        setError(null)
        setLoading(false)
        return
      }

      if (!user) return

      // Rate limit cooldown: don't make a new request, serve cache or error
      const cooldownEnd = cooldownUntilMap.get(normalized) ?? 0
      if (Date.now() < cooldownEnd) {
        const cached = objectsCache.get(normalized)
        if (cached) {
          setObjects(cached.data)
          setObjectsAccountId(normalized)
        } else {
          setObjects(null)
          setObjectsAccountId(null)
        }
        setError('Meta API 요청 제한에 도달했습니다. 잠시 후 다시 시도하세요.')
        setLoading(false)
        return
      }

      if (!force) {
        // Serve from cache if fresh enough
        const cached = objectsCache.get(normalized)
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
          setObjects(cached.data)
          setObjectsAccountId(normalized)
          setError(null)
          setLoading(false)
          return
        }

        // Skip duplicate in-flight request for the same accountId.
        // seq is NOT incremented here — only actual new fetches get a seq,
        // so the in-flight request's seq check remains valid.
        if (inFlight.has(normalized)) return
      }

      // Increment seq only for actual new fetches (after all early-returns).
      // This prevents the in-flight request's seq from being invalidated by
      // a second caller that returns early via the inFlight guard above.
      const seq = ++requestSeqRef.current

      // Clear stale data from a different account
      setObjects(null)
      setObjectsAccountId(null)
      setLoading(true)
      setError(null)

      inFlight.add(normalized)

      try {
        const res = await authFetch(
          user,
          `/api/meta/objects?accountId=${encodeURIComponent(normalized)}`
        )
        const data = (await res.json()) as Record<string, unknown>

        if (seq !== requestSeqRef.current) return

        if (res.status === 429) {
          const retryAfter = (data['retryAfterSeconds'] as number | undefined) ?? 60
          cooldownUntilMap.set(normalized, Date.now() + retryAfter * 1000)
          const cached = objectsCache.get(normalized)
          if (cached) {
            setObjects(cached.data)
            setObjectsAccountId(normalized)
          }
          setError('Meta API 요청 제한에 도달했습니다. 잠시 후 다시 시도하세요.')
          return
        }

        if (!res.ok) {
          const base = (data['error'] as string | undefined) ?? 'Meta objects 조회 실패'
          const detail = data['detail'] as string | undefined

          if (isRateLimitError(detail)) {
            cooldownUntilMap.set(normalized, Date.now() + COOLDOWN_MS)
            const cached = objectsCache.get(normalized)
            if (cached) {
              setObjects(cached.data)
              setObjectsAccountId(normalized)
            }
            setError('Meta API 요청 제한에 도달했습니다. 잠시 후 다시 시도하세요.')
            return
          }

          throw new Error(detail ? `${base}: ${detail}` : base)
        }

        const result = data as unknown as MetaObjectsResponse
        objectsCache.set(normalized, { data: result, fetchedAt: Date.now() })
        setObjects(result)
        setObjectsAccountId(normalized)
        setError(null)
      } catch (err) {
        if (seq !== requestSeqRef.current) return
        const msg = err instanceof Error ? err.message : 'Meta objects 조회 실패'

        if (isRateLimitError(msg)) {
          cooldownUntilMap.set(normalized, Date.now() + COOLDOWN_MS)
          const cached = objectsCache.get(normalized)
          if (cached) {
            setObjects(cached.data)
            setObjectsAccountId(normalized)
          }
          setError('Meta API 요청 제한에 도달했습니다. 잠시 후 다시 시도하세요.')
          return
        }

        setError(msg)
      } finally {
        inFlight.delete(normalized)
        if (seq === requestSeqRef.current) {
          setLoading(false)
        }
      }
    },
    [user]
  )

  return { loading, error, objects, objectsAccountId, reload }
}
