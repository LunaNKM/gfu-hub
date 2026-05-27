'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { User } from 'firebase/auth'
import {
  Campaign,
  CampaignBlock,
  CampaignBlockType,
  CampaignBusinessType,
  CampaignCellValue,
  CampaignDataColumn,
  CampaignDataRow,
  CampaignDatabase,
  CampaignOverview,
  CampaignSection,
  CampaignSectionType,
} from '@/types'
import { buildCampaignOverview } from '@/lib/campaigns/overview'
import { normalizeColumn } from '@/lib/campaigns/normalizeColumn'
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

  // 안정적인 databases 참조 (addDatabaseRow deps에서 databases 제거)
  const databasesRef = useRef<CampaignDatabase[]>([])
  databasesRef.current = databases

  // POST 중인 행 ID → 큐잉된 셀 변경 목록 (PATCH 404 방지)
  const pendingRowsRef = useRef<Map<string, Array<{ colId: string; value: CampaignCellValue }>>>(new Map())

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

      // 기존 string[] options → CampaignSelectOption[] 런타임 정규화
      const rawDatabases = (data.databases ?? []).map((db: CampaignDatabase) => ({
        ...db,
        columns: (db.columns ?? []).map(normalizeColumn),
      }))
      const rawSections = (data.sections ?? []).map((section: CampaignSection) => {
        if (
          section.type === 'data_table' &&
          section.content &&
          typeof section.content === 'object' &&
          'columns' in section.content
        ) {
          return {
            ...section,
            content: {
              ...section.content,
              columns: (section.content as { columns: unknown[] }).columns.map(normalizeColumn),
            },
          }
        }
        return section
      })

      setSections(rawSections)
      setBlocks(data.blocks ?? [])
      setDatabases(rawDatabases)
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

  // ── 데이터베이스 행 핸들러 (PART A: 행 분리) ──────────────────────────

  const updateDatabaseRow = useCallback(
    (databaseId: string, rowId: string, colId: string, value: CampaignCellValue) => {
      // 낙관적 로컬 업데이트
      setDatabases((prev) => {
        const next = prev.map((db) => {
          if (db.id !== databaseId) return db
          const rows = db.rows.map((row) =>
            row.id === rowId ? { ...row, cells: { ...row.cells, [colId]: value } } : row
          )
          return { ...db, rows }
        })
        setOverview(buildCampaignOverview(next))
        return next
      })
      setResourceStatus('databases', databaseId, 'saving')

      // 행이 아직 서버에 POST 중이면 큐에 쌓음 (PATCH 404 방지)
      if (pendingRowsRef.current.has(rowId)) {
        const queue = pendingRowsRef.current.get(rowId)!
        const existingIdx = queue.findIndex((q) => q.colId === colId)
        if (existingIdx >= 0) queue[existingIdx].value = value
        else queue.push({ colId, value })
        return
      }

      if (!user) return
      user.getIdToken()
        .then((token) =>
          fetch(`/api/campaigns/${campaignId}/databases/${databaseId}/rows/${rowId}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ cells: { [colId]: value } }),
          })
        )
        .then((res) => {
          if (res.ok) {
            setResourceStatus('databases', databaseId, 'saved')
            return
          }

          console.error(`[updateDatabaseRow] PATCH failed: databaseId=${databaseId} rowId=${rowId} colId=${colId}`)
          setResourceStatus('databases', databaseId, 'error')
          setSaveState((prev) => ({
            ...prev,
            errorMessage: `셀 저장 실패 (db: ${databaseId}, row: ${rowId})`,
          }))
        })
        .catch((err) => {
          console.error('[updateDatabaseRow] PATCH error:', err)
          setResourceStatus('databases', databaseId, 'error')
          setSaveState((prev) => ({
            ...prev,
            errorMessage: `셀 저장 실패 (db: ${databaseId}, row: ${rowId})`,
          }))
        })
    },
    [campaignId, user, setResourceStatus]
  )

  const addDatabaseRow = useCallback(
    async (databaseId: string, afterRowId?: string) => {
      if (!user) return null
      const db = databasesRef.current.find((d) => d.id === databaseId)
      if (!db) return null

      // 빈 셀 초기화
      const cells: Record<string, CampaignCellValue> = {}
      for (const col of db.columns) cells[col.id] = null

      // order 계산 (afterRow 다음 or 마지막)
      const sortedRows = [...db.rows].sort(
        (a, b) =>
          ((a as CampaignDataRow & { order?: number }).order ?? 0) -
          ((b as CampaignDataRow & { order?: number }).order ?? 0)
      )
      let order = (sortedRows.length + 1) * 1000
      if (afterRowId) {
        const idx = sortedRows.findIndex((r) => r.id === afterRowId)
        if (idx >= 0) {
          const current = (sortedRows[idx] as CampaignDataRow & { order?: number }).order ?? (idx + 1) * 1000
          const next = sortedRows[idx + 1]
          const nextOrder = next
            ? ((next as CampaignDataRow & { order?: number }).order ?? (idx + 2) * 1000)
            : current + 2000
          order = Math.round((current + nextOrder) / 2)
        }
      }

      const newRowId = `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const newRow: CampaignDataRow = { id: newRowId, cells }

      // POST 완료 전에 셀 편집이 들어오면 큐에 쌓히도록 pending 등록
      pendingRowsRef.current.set(newRowId, [])

      // 낙관적 업데이트
      setDatabases((prev) => {
        const next = prev.map((d) => {
          if (d.id !== databaseId) return d
          const rows = afterRowId
            ? (() => {
                const idx = d.rows.findIndex((r) => r.id === afterRowId)
                const arr = [...d.rows]
                arr.splice(idx + 1, 0, newRow)
                return arr
              })()
            : [...d.rows, newRow]
          return { ...d, rows }
        })
        setOverview(buildCampaignOverview(next))
        return next
      })

      const token = await user.getIdToken()
      const res = await fetch(`/api/campaigns/${campaignId}/databases/${databaseId}/rows`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newRowId, cells, order }),
      })

      if (!res.ok) {
        // pending 해제 후 롤백
        pendingRowsRef.current.delete(newRowId)
        setResourceStatus('databases', databaseId, 'error')
        setSaveState((prev) => ({
          ...prev,
          errorMessage: `행 생성 실패 (db: ${databaseId}, row: ${newRowId})`,
        }))
        setDatabases((prev) =>
          prev.map((d) =>
            d.id === databaseId ? { ...d, rows: d.rows.filter((r) => r.id !== newRowId) } : d
          )
        )
        return null
      }

      // pending 해제 + 큐에 쌓인 셀 변경 플러시
      const queue = pendingRowsRef.current.get(newRowId) ?? []
      pendingRowsRef.current.delete(newRowId)

      if (queue.length > 0) {
        const mergedCells: Record<string, CampaignCellValue> = {}
        for (const { colId, value } of queue) mergedCells[colId] = value
        const freshToken = await user.getIdToken()
        const flushRes = await fetch(`/api/campaigns/${campaignId}/databases/${databaseId}/rows/${newRowId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${freshToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ cells: mergedCells }),
        })
        if (!flushRes.ok) {
          console.error(`[addDatabaseRow] queued PATCH failed: databaseId=${databaseId} rowId=${newRowId}`)
          setResourceStatus('databases', databaseId, 'error')
          setSaveState((prev) => ({
            ...prev,
            errorMessage: `새 행 셀 저장 실패 (db: ${databaseId}, row: ${newRowId})`,
          }))
          return null
        }
      }

      return newRow
    },
    [campaignId, setResourceStatus, user]
  )

  const deleteDatabaseRows = useCallback(
    async (databaseId: string, rowIds: string[]) => {
      if (!user || rowIds.length === 0) return

      // 낙관적 업데이트
      setDatabases((prev) => {
        const next = prev.map((d) =>
          d.id === databaseId ? { ...d, rows: d.rows.filter((r) => !rowIds.includes(r.id)) } : d
        )
        setOverview(buildCampaignOverview(next))
        return next
      })

      const token = await user.getIdToken()
      await Promise.all(
        rowIds.map((rowId) =>
          fetch(`/api/campaigns/${campaignId}/databases/${databaseId}/rows/${rowId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })
        )
      )
    },
    [campaignId, user]
  )

  const updateDatabaseColumns = useCallback(
    (databaseId: string, columns: CampaignDataColumn[]) => {
      setDatabases((prev) => {
        const next = prev.map((d) => (d.id === databaseId ? { ...d, columns } : d))
        setOverview(buildCampaignOverview(next))
        return next
      })
      setResourceStatus('databases', databaseId, 'saving')
      databaseSaver.schedule(databaseId, { columns })
    },
    [databaseSaver, setResourceStatus]
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
    updateDatabaseRow,
    addDatabaseRow,
    deleteDatabaseRows,
    updateDatabaseColumns,
    addBlock,
    updateBlock,
    patchBlock,
    deleteBlock,
    moveBlock,
  }
}
