'use client'

import { useCallback, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { User } from 'firebase/auth'
import type { MetaObjectsResponse } from '@/types/campaignMeta'

// ── accountId 정규화 헬퍼 ─────────────────────────────────────────
// act_ prefix가 없으면 붙임. 비교 기준으로 사용.

export function normalizeMetaAccountId(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`
}

// ── auth helper ───────────────────────────────────────────────────

async function authFetch(user: User, url: string): Promise<Response> {
  const token = await user.getIdToken()
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

// ── hook ──────────────────────────────────────────────────────────

export function useMetaObjects() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [objects, setObjects] = useState<MetaObjectsResponse | null>(null)

  // 현재 objects가 어떤 accountId에서 로드되었는지 추적 (normalized)
  const [objectsAccountId, setObjectsAccountId] = useState<string | null>(null)

  // 요청 순서 카운터 — 늦게 도착한 이전 요청의 응답이 현재 상태를 덮어쓰지 않게 함
  const requestSeqRef = useRef(0)

  const reload = useCallback(
    async (metaAccountId: string) => {
      const normalized = normalizeMetaAccountId(metaAccountId)

      // 모든 reload 호출에서 seq를 증가시켜 이전 in-flight 요청을 무효화
      const seq = ++requestSeqRef.current

      if (!normalized) {
        // accountId가 비어있으면 모든 상태를 초기화하고 종료
        setObjects(null)
        setObjectsAccountId(null)
        setError(null)
        setLoading(false)
        return
      }

      if (!user) return

      // 이전 계정의 stale data를 즉시 제거 — 절대 stale list가 화면에 남지 않게 함
      setObjects(null)
      setObjectsAccountId(null)
      setLoading(true)
      setError(null)

      try {
        const res = await authFetch(
          user,
          `/api/meta/objects?accountId=${encodeURIComponent(normalized)}`
        )
        const data = (await res.json()) as Record<string, unknown>

        // 더 새로운 요청이 시작된 경우 이 응답은 무시
        if (seq !== requestSeqRef.current) return

        if (!res.ok) {
          const base =
            (data['error'] as string | undefined) ?? 'Meta objects 조회 실패'
          const detail = data['detail'] as string | undefined
          throw new Error(detail ? `${base}: ${detail}` : base)
        }

        setObjects(data as unknown as MetaObjectsResponse)
        setObjectsAccountId(normalized)
      } catch (err) {
        // 더 새로운 요청이 시작된 경우 에러도 무시
        if (seq !== requestSeqRef.current) return
        setError(err instanceof Error ? err.message : 'Meta objects 조회 실패')
      } finally {
        // 현재 요청인 경우에만 loading 해제 — 이전 요청의 finally가 새 로딩 상태를 덮어쓰지 않게 함
        if (seq === requestSeqRef.current) {
          setLoading(false)
        }
      }
    },
    [user]
  )

  return { loading, error, objects, objectsAccountId, reload }
}
