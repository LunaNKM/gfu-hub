'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { User } from 'firebase/auth'
import {
  Campaign,
  CampaignBlock,
  CampaignBlockType,
  CampaignBusinessType,
  CampaignDatabase,
  CampaignOverview,
  CampaignSection,
  CampaignSectionType,
} from '@/types'
import { buildCampaignOverview } from '@/lib/campaigns/overview'
import { useDebouncedResourceSave } from './useDebouncedResourceSave'

export type ResourceSaveStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error'

export type WorkspaceSaveState = {
  global: ResourceSaveStatus
  sections: Record<string, ResourceSaveStatus>
  blocks: Record<string, ResourceSaveStatus>
  databases: Record<string, ResourceSaveStatus>
  errorMessage?: string
}

const initialSaveState: WorkspaceSaveState = {
  global: 'idle',
  sections: {},
  blocks: {},
  databases: {},
}

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

export function useCampaignWorkspace(campaignId: string, user: User | null | undefined) {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [sections, setSections] = useState<CampaignSection[]>([])
  const [blocks, setBlocks] = useState<CampaignBlock[]>([])
  const [databases, setDatabases] = useState<CampaignDatabase[]>([])
  const [overview, setOverview] = useState<CampaignOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<WorkspaceSaveState>(initialSaveState)

  const setResourceStatus = useCallback(
    (bucket: 'sections' | 'blocks' | 'databases', id: string, status: ResourceSaveStatus) => {
      setSaveState((prev) => ({
        ...prev,
        global: status === 'saving' || status === 'error' ? status : prev.global,
        [bucket]: { ...prev[bucket], [id]: status },
      }))
      if (status === 'saved') {
        setSaveState((prev) => ({ ...prev, global: 'saved' }))
        window.setTimeout(() => {
          setSaveState((prev) => (prev.global === 'saved' ? { ...prev, global: 'idle' } : prev))
        }, 2000)
      }
    },
    []
  )

  const reloadWorkspace = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    setSaveState((prev) => ({ ...prev, global: 'loading' }))
    try {
      const res = await authFetch(user, `/api/campaigns/${campaignId}/workspace`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '워크스페이스를 불러올 수 없습니다.')
      setCampaign(data.campaign)
      setSections(data.sections ?? [])
      setBlocks(data.blocks ?? [])
      setDatabases(data.databases ?? [])
      setOverview(data.overview ?? null)
      setSaveState((prev) => ({ ...prev, global: 'idle' }))
    } catch (err) {
      const message = err instanceof Error ? err.message : '워크스페이스를 불러올 수 없습니다.'
      setError(message)
      setSaveState((prev) => ({ ...prev, global: 'error', errorMessage: message }))
    } finally {
      setLoading(false)
    }
  }, [campaignId, user])

  useEffect(() => {
    void reloadWorkspace()
  }, [reloadWorkspace])

  const sectionSaver = useDebouncedResourceSave(
    async (sectionId, patch) => {
      if (!user) throw new Error('로그인이 필요합니다.')
      const res = await authFetch(user, `/api/campaigns/${campaignId}/sections/${sectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('섹션 저장 실패')
    },
    {
      onSuccess: (id) => setResourceStatus('sections', id, 'saved'),
      onError: (id, error) => {
        setResourceStatus('sections', id, 'error')
        setSaveState((prev) => ({ ...prev, errorMessage: error instanceof Error ? error.message : '섹션 저장 실패' }))
      },
    }
  )

  const blockSaver = useDebouncedResourceSave(
    async (blockId, patch) => {
      if (!user) throw new Error('로그인이 필요합니다.')
      const res = await authFetch(user, `/api/campaigns/${campaignId}/blocks/${blockId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('블록 저장 실패')
    },
    {
      onSuccess: (id) => setResourceStatus('blocks', id, 'saved'),
      onError: (id, error) => {
        setResourceStatus('blocks', id, 'error')
        setSaveState((prev) => ({ ...prev, errorMessage: error instanceof Error ? error.message : '블록 저장 실패' }))
      },
    }
  )

  const databaseSaver = useDebouncedResourceSave(
    async (databaseId, patch) => {
      if (!user) throw new Error('로그인이 필요합니다.')
      const res = await authFetch(user, `/api/campaigns/${campaignId}/databases/${databaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('데이터베이스 저장 실패')
    },
    {
      onSuccess: (id) => setResourceStatus('databases', id, 'saved'),
      onError: (id, error) => {
        setResourceStatus('databases', id, 'error')
        setSaveState((prev) => ({ ...prev, errorMessage: error instanceof Error ? error.message : '데이터베이스 저장 실패' }))
      },
    }
  )

  const updateSection = useCallback(
    (sectionId: string, patch: Partial<CampaignSection>) => {
      setSections((prev) => prev.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)))
      setResourceStatus('sections', sectionId, 'saving')
      sectionSaver.schedule(sectionId, patch as Record<string, unknown>)
    },
    [sectionSaver, setResourceStatus]
  )

  const updateDatabase = useCallback(
    (databaseId: string, patch: Partial<CampaignDatabase>) => {
      setDatabases((prev) => {
        const next = prev.map((database) => (database.id === databaseId ? { ...database, ...patch } : database))
        setOverview(buildCampaignOverview(next))
        return next
      })
      setResourceStatus('databases', databaseId, 'saving')
      databaseSaver.schedule(databaseId, patch as Record<string, unknown>)
    },
    [databaseSaver, setResourceStatus]
  )

  const updateBlock = useCallback(
    (blockId: string, content: Record<string, unknown>) => {
      setBlocks((prev) => prev.map((block) => (block.id === blockId ? { ...block, content } : block)))
      setResourceStatus('blocks', blockId, 'saving')
      blockSaver.schedule(blockId, { content })
    },
    [blockSaver, setResourceStatus]
  )

  const patchBlock = useCallback(
    (blockId: string, patch: Partial<CampaignBlock>) => {
      setBlocks((prev) => prev.map((block) => (block.id === blockId ? { ...block, ...patch } : block)))
      setResourceStatus('blocks', blockId, 'saving')
      blockSaver.schedule(blockId, patch as Record<string, unknown>)
    },
    [blockSaver, setResourceStatus]
  )

  const addBlock = useCallback(
    async (sectionId: string, type: CampaignBlockType, content: Record<string, unknown> = {}) => {
      if (!user) return
      const sectionBlocks = blocks.filter((block) => block.sectionId === sectionId)
      const maxOrder = sectionBlocks.reduce((max, block) => Math.max(max, block.order ?? 0), 0)
      const res = await authFetch(user, `/api/campaigns/${campaignId}/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId, type, order: maxOrder + 1000, content }),
      })
      const data = await res.json()
      if (res.ok) setBlocks((prev) => [...prev, data.block as CampaignBlock])
    },
    [blocks, campaignId, user]
  )

  const deleteBlock = useCallback(
    async (blockId: string) => {
      if (!user) return
      const res = await authFetch(user, `/api/campaigns/${campaignId}/blocks/${blockId}`, { method: 'DELETE' })
      if (res.ok) setBlocks((prev) => prev.filter((block) => block.id !== blockId))
    },
    [campaignId, user]
  )

  const moveBlock = useCallback(
    (sectionId: string, blockId: string, direction: 'up' | 'down') => {
      const sectionBlocks = blocks
        .filter((block) => block.sectionId === sectionId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      const currentIndex = sectionBlocks.findIndex((block) => block.id === blockId)
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sectionBlocks.length) return

      const reordered = [...sectionBlocks]
      const [moved] = reordered.splice(currentIndex, 1)
      reordered.splice(targetIndex, 0, moved)
      reordered.forEach((block, index) => {
        patchBlock(block.id, { order: (index + 1) * 1000 })
      })
    },
    [blocks, patchBlock]
  )

  const addSection = useCallback(
    async (type: CampaignSectionType) => {
      if (!user) return null
      const res = await authFetch(user, `/api/campaigns/${campaignId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const data = await res.json()
      if (!res.ok) return null
      const section = data.section as CampaignSection
      setSections((prev) => [...prev, section])
      return section
    },
    [campaignId, user]
  )

  const addDatabase = useCallback(
    async (businessType: CampaignBusinessType) => {
      if (!user) return null
      const res = await authFetch(user, `/api/campaigns/${campaignId}/databases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessType }),
      })
      const data = await res.json()
      if (!res.ok) return null
      const database = data.database as CampaignDatabase
      setDatabases((prev) => {
        const next = [...prev, database]
        setOverview(buildCampaignOverview(next))
        return next
      })
      return database
    },
    [campaignId, user]
  )

  const reorderSections = useCallback(
    async (newSections: CampaignSection[]) => {
      setSections(newSections)
      if (!user) return
      await authFetch(user, `/api/campaigns/${campaignId}/sections/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionIds: newSections.map((section) => section.id) }),
      })
    },
    [campaignId, user]
  )

  const saveStatus = useMemo(() => saveState.global, [saveState.global])

  return {
    campaign,
    sections,
    blocks,
    databases,
    overview,
    loading,
    error,
    saveState,
    saveStatus,
    reloadWorkspace,
    addSection,
    updateSection,
    reorderSections,
    addDatabase,
    updateDatabase,
    addBlock,
    updateBlock,
    patchBlock,
    deleteBlock,
    moveBlock,
  }
}
