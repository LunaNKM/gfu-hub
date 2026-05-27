'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Loader2 } from 'lucide-react'
import {
  Campaign,
  CampaignSection,
  CampaignSectionType,
  CampaignBlock,
  CampaignDatabase,
  CampaignBusinessType,
  CampaignOverview,
  CampaignDataTableContent,
  CampaignDashboardContent,
  CampaignBlockType,
} from '@/types'
import { SectionSidebar, type ActiveView } from './SectionSidebar'
import { CampaignOverviewDashboard } from './CampaignOverviewDashboard'
import { CampaignDatabaseEditor } from './CampaignDatabaseEditor'
import { CampaignSectionDocument } from './CampaignSectionDocument'
import { DataTableSectionEditor } from './DataTableSectionEditor'
import { DashboardSectionEditor } from './DashboardSectionEditor'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  campaignId: string
}

export function CampaignWorkspace({ campaignId }: Props) {
  const { user } = useAuth()

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [sections, setSections] = useState<CampaignSection[]>([])
  const [blocks, setBlocks] = useState<CampaignBlock[]>([])
  const [databases, setDatabases] = useState<CampaignDatabase[]>([])
  const [overview, setOverview] = useState<CampaignOverview | null>(null)
  const [activeView, setActiveView] = useState<ActiveView>({ type: 'overview' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingPatches = useRef<Record<string, unknown>>({})

  // ── 초기 로드 ──────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!user) return
    try {
      const token = await user.getIdToken()
      const res = await fetch(`/api/campaigns/${campaignId}/workspace`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCampaign(data.campaign)
      setSections(data.sections ?? [])
      setBlocks(data.blocks ?? [])
      setDatabases(data.databases ?? [])
      setOverview(data.overview ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [campaignId, user])

  useEffect(() => { load() }, [load])

  // ── 섹션 저장 ──────────────────────────────────────────────────

  const scheduleSectionSave = useCallback(
    (sectionId: string, patch: Partial<CampaignSection>) => {
      const key = `section:${sectionId}`
      pendingPatches.current[key] = { ...(pendingPatches.current[key] as object ?? {}), ...patch }
      if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key])
      setSaveStatus('saving')
      debounceRefs.current[key] = setTimeout(async () => {
        try {
          if (!user) throw new Error('로그인이 필요합니다.')
          const token = await user.getIdToken()
          const body = pendingPatches.current[key]
          delete pendingPatches.current[key]
          const res = await fetch(`/api/campaigns/${campaignId}/sections/${sectionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
          })
          if (!res.ok) throw new Error()
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2000)
        } catch {
          setSaveStatus('error')
        }
      }, 800)
    },
    [campaignId, user]
  )

  const updateSection = useCallback(
    (sectionId: string, patch: Partial<CampaignSection>) => {
      setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)))
      scheduleSectionSave(sectionId, patch)
    },
    [scheduleSectionSave]
  )

  // ── 데이터베이스 저장 ──────────────────────────────────────────

  const scheduleDatabaseSave = useCallback(
    (databaseId: string, patch: Partial<CampaignDatabase>) => {
      const key = `db:${databaseId}`
      pendingPatches.current[key] = { ...(pendingPatches.current[key] as object ?? {}), ...patch }
      if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key])
      setSaveStatus('saving')
      debounceRefs.current[key] = setTimeout(async () => {
        try {
          if (!user) throw new Error('로그인이 필요합니다.')
          const token = await user.getIdToken()
          const body = pendingPatches.current[key]
          delete pendingPatches.current[key]
          const res = await fetch(`/api/campaigns/${campaignId}/databases/${databaseId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
          })
          if (!res.ok) throw new Error()
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2000)
        } catch {
          setSaveStatus('error')
        }
      }, 800)
    },
    [campaignId, user]
  )

  const updateDatabase = useCallback(
    (databaseId: string, patch: Partial<CampaignDatabase>) => {
      setDatabases((prev) =>
        prev.map((d) => (d.id === databaseId ? { ...d, ...patch } : d))
      )
      // overview 재계산
      setDatabases((prev) => {
        const updated = prev.map((d) => (d.id === databaseId ? { ...d, ...patch } : d))
        import('@/lib/campaigns/overview').then(({ buildCampaignOverview }) => {
          setOverview(buildCampaignOverview(updated))
        })
        return updated
      })
      scheduleDatabaseSave(databaseId, patch)
    },
    [scheduleDatabaseSave]
  )

  // ── 블록 업데이트 ──────────────────────────────────────────────

  const updateBlock = useCallback(
    (blockId: string, content: Record<string, unknown>) => {
      setBlocks((prev) =>
        prev.map((b) => (b.id === blockId ? { ...b, content } : b))
      )
      const key = `block:${blockId}`
      if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key])
      setSaveStatus('saving')
      debounceRefs.current[key] = setTimeout(async () => {
        try {
          if (!user) return
          const token = await user.getIdToken()
          await fetch(`/api/campaigns/${campaignId}/blocks/${blockId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ content }),
          })
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2000)
        } catch {
          setSaveStatus('error')
        }
      }, 800)
    },
    [campaignId, user]
  )

  // ── 섹션 추가 ──────────────────────────────────────────────────

  const patchBlock = useCallback(
    (blockId: string, patch: Partial<CampaignBlock>) => {
      setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, ...patch } : b)))
      const key = `block:${blockId}`
      pendingPatches.current[key] = { ...(pendingPatches.current[key] as object ?? {}), ...patch }
      if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key])
      setSaveStatus('saving')
      debounceRefs.current[key] = setTimeout(async () => {
        try {
          if (!user) return
          const token = await user.getIdToken()
          const body = pendingPatches.current[key]
          delete pendingPatches.current[key]
          const res = await fetch(`/api/campaigns/${campaignId}/blocks/${blockId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
          })
          if (!res.ok) throw new Error()
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2000)
        } catch {
          setSaveStatus('error')
        }
      }, 800)
    },
    [campaignId, user]
  )

  const addBlock = useCallback(
    async (
      sectionId: string,
      type: CampaignBlockType,
      content: Record<string, unknown> = {}
    ) => {
      if (!user) return
      try {
        const token = await user.getIdToken()
        const sectionBlocks = blocks.filter((b) => b.sectionId === sectionId)
        const maxOrder = sectionBlocks.reduce((max, block) => Math.max(max, block.order ?? 0), 0)
        const res = await fetch(`/api/campaigns/${campaignId}/blocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sectionId, type, order: maxOrder + 1000, content }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setBlocks((prev) => [...prev, data.block as CampaignBlock])
      } catch (e) {
        console.error('블록 추가 실패:', e)
      }
    },
    [blocks, campaignId, user]
  )

  const deleteBlock = useCallback(
    async (blockId: string) => {
      if (!user) return
      try {
        const token = await user.getIdToken()
        const res = await fetch(`/api/campaigns/${campaignId}/blocks/${blockId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error()
        setBlocks((prev) => prev.filter((block) => block.id !== blockId))
      } catch (e) {
        console.error('블록 삭제 실패:', e)
      }
    },
    [campaignId, user]
  )

  const moveBlock = useCallback(
    (sectionId: string, blockId: string, direction: 'up' | 'down') => {
      const sectionBlocks = blocks
        .filter((b) => b.sectionId === sectionId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      const currentIndex = sectionBlocks.findIndex((b) => b.id === blockId)
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
      if (!user) return
      try {
        const token = await user.getIdToken()
        const res = await fetch(`/api/campaigns/${campaignId}/sections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ type }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        const newSection = data.section as CampaignSection
        setSections((prev) => [...prev, newSection])
        setActiveView({ type: 'section', id: newSection.id })
      } catch (e) {
        console.error('섹션 추가 실패:', e)
      }
    },
    [campaignId, user]
  )

  // ── 데이터베이스 추가 ──────────────────────────────────────────

  const addDatabase = useCallback(
    async (businessType: CampaignBusinessType) => {
      if (!user) return
      try {
        const token = await user.getIdToken()
        const res = await fetch(`/api/campaigns/${campaignId}/databases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ businessType }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        const newDb = data.database as CampaignDatabase
        setDatabases((prev) => [...prev, newDb])
        setActiveView({ type: 'database', id: newDb.id })
      } catch (e) {
        console.error('데이터베이스 추가 실패:', e)
      }
    },
    [campaignId, user]
  )

  // ── 섹션 순서 변경 ─────────────────────────────────────────────

  const reorderSections = useCallback(
    async (newSections: CampaignSection[]) => {
      setSections(newSections)
      try {
        if (!user) return
        const token = await user.getIdToken()
        await fetch(`/api/campaigns/${campaignId}/sections/reorder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sectionIds: newSections.map((s) => s.id) }),
        })
      } catch (e) {
        console.error('순서 변경 실패:', e)
      }
    },
    [campaignId, user]
  )

  // ── 현재 활성 뷰 ───────────────────────────────────────────────

  const activeSection =
    activeView.type === 'section'
      ? sections.find((s) => s.id === activeView.id) ?? null
      : null

  const activeDatabase =
    activeView.type === 'database'
      ? databases.find((d) => d.id === activeView.id) ?? null
      : null

  // 브레드크럼 텍스트
  const breadcrumb =
    activeView.type === 'overview'
      ? '종합 대시보드'
      : activeSection?.title ?? activeDatabase?.title ?? ''

  // ── 렌더 ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-300">
        <Loader2 size={24} className="animate-spin" />
      </div>
    )
  }

  if (error || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-2 text-gray-400">
        <p className="text-sm">{error ?? '캠페인을 찾을 수 없습니다.'}</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* 좌측 사이드바 */}
      <SectionSidebar
        campaignName={campaign.campaignName}
        clientName={campaign.clientName}
        sections={sections}
        databases={databases}
        activeView={activeView}
        onSelectView={setActiveView}
        onAddSection={addSection}
        onAddDatabase={addDatabase}
        onReorder={reorderSections}
      />

      {/* 중앙 편집 영역 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 상단 바 */}
        <div className="flex items-center justify-between px-4 border-b border-gray-200 bg-white shrink-0 h-10">
          <div className="flex items-center gap-1.5 text-sm min-w-0">
            <span className="text-gray-400 text-xs truncate shrink-0">{campaign.clientName}</span>
            <span className="text-gray-300 text-xs shrink-0">›</span>
            <span className="text-gray-700 font-medium text-sm truncate">{breadcrumb}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-4">
            {saveStatus === 'saving' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-xs text-gray-400">저장 중...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-xs text-gray-400">저장됨</span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                <span className="text-xs text-red-400">저장 실패</span>
              </>
            )}
          </div>
        </div>

        {/* 편집기 */}
        <div className="flex-1 overflow-hidden">
          {/* 종합 대시보드 */}
          {activeView.type === 'overview' && (
            <CampaignOverviewDashboard overview={overview} />
          )}

          {/* 섹션 */}
          {activeView.type === 'section' && activeSection && (
            <>
              {activeSection.type === 'document' && (
                <CampaignSectionDocument
                  key={activeSection.id}
                  section={activeSection}
                  blocks={blocks}
                  databases={databases}
                  campaignId={campaignId}
                  onBlockUpdate={updateBlock}
                  onBlockPatch={patchBlock}
                  onBlockAdd={addBlock}
                  onBlockDelete={deleteBlock}
                  onBlockMove={moveBlock}
                />
              )}
              {activeSection.type === 'data_table' && (
                <DataTableSectionEditor
                  key={activeSection.id}
                  content={activeSection.content as CampaignDataTableContent}
                  onChange={(content) => updateSection(activeSection.id, { content })}
                />
              )}
              {activeSection.type === 'dashboard' && (
                <DashboardSectionEditor
                  key={activeSection.id}
                  content={activeSection.content as CampaignDashboardContent}
                  allSections={sections}
                  onChange={(content) => updateSection(activeSection.id, { content })}
                />
              )}
            </>
          )}

          {/* 데이터베이스 */}
          {activeView.type === 'database' && activeDatabase && (
            <CampaignDatabaseEditor
              key={activeDatabase.id}
              database={activeDatabase}
              onChange={(patch) => updateDatabase(activeDatabase.id, patch)}
            />
          )}

          {/* 빈 상태 */}
          {activeView.type === 'section' && !activeSection && (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              섹션을 찾을 수 없습니다.
            </div>
          )}
          {activeView.type === 'database' && !activeDatabase && (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              데이터베이스를 찾을 수 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
