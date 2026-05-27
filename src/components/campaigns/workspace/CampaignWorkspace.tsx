'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Loader2 } from 'lucide-react'
import { Campaign, CampaignSection, CampaignSectionType, CampaignDocumentContent, CampaignDataTableContent, CampaignDashboardContent } from '@/types'
import { SectionSidebar } from './SectionSidebar'
import { SectionSettings } from './SectionSettings'
import { DocumentSectionEditor } from './DocumentSectionEditor'
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
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingPatches = useRef<Record<string, Partial<CampaignSection>>>({})

  const activeSection = sections.find((s) => s.id === activeSectionId) ?? null

  // 워크스페이스 초기 로드
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
      setSections(data.sections)
      setActiveSectionId((prev) => prev ?? data.sections[0]?.id ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [campaignId, user])

  useEffect(() => { load() }, [load])

  // debounce 저장
  const scheduleSave = useCallback(
    (sectionId: string, patch: Partial<CampaignSection>) => {
      pendingPatches.current[sectionId] = {
        ...(pendingPatches.current[sectionId] ?? {}),
        ...patch,
      }
      if (debounceRefs.current[sectionId]) clearTimeout(debounceRefs.current[sectionId])
      setSaveStatus('saving')
      debounceRefs.current[sectionId] = setTimeout(async () => {
        try {
          if (!user) throw new Error('로그인이 필요합니다.')
          const token = await user.getIdToken()
          const body = pendingPatches.current[sectionId] ?? patch
          delete pendingPatches.current[sectionId]
          const res = await fetch(`/api/campaigns/${campaignId}/sections/${sectionId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
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

  // 섹션 로컬 업데이트 + 저장 예약
  const updateSection = useCallback(
    (sectionId: string, patch: Partial<CampaignSection>) => {
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, ...patch } : s))
      )
      scheduleSave(sectionId, patch)
    },
    [scheduleSave]
  )

  // 섹션 추가
  const addSection = useCallback(
    async (type: CampaignSectionType) => {
      if (!user) return
      try {
        const token = await user.getIdToken()
        const res = await fetch(`/api/campaigns/${campaignId}/sections`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ type }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        const newSection = data.section as CampaignSection
        setSections((prev) => [...prev, newSection])
        setActiveSectionId(newSection.id)
      } catch (e) {
        console.error('섹션 추가 실패:', e)
      }
    },
    [campaignId, user]
  )

  // 섹션 삭제
  const deleteSection = useCallback(
    async (sectionId: string) => {
      if (!user) return
      try {
        const token = await user.getIdToken()
        const res = await fetch(`/api/campaigns/${campaignId}/sections/${sectionId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error()
        setSections((prev) => {
          const next = prev.filter((s) => s.id !== sectionId)
          if (activeSectionId === sectionId) {
            setActiveSectionId(next[0]?.id ?? null)
          }
          return next
        })
      } catch (e) {
        console.error('섹션 삭제 실패:', e)
      }
    },
    [campaignId, user, activeSectionId]
  )

  // 섹션 순서 변경
  const reorderSections = useCallback(
    async (newSections: CampaignSection[]) => {
      setSections(newSections)
      try {
        if (!user) throw new Error('로그인이 필요합니다.')
        const token = await user.getIdToken()
        await fetch(`/api/campaigns/${campaignId}/sections/reorder`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sectionIds: newSections.map((s) => s.id) }),
        })
      } catch (e) {
        console.error('순서 변경 실패:', e)
      }
    },
    [campaignId, user]
  )

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
        activeSectionId={activeSectionId}
        onSelectSection={setActiveSectionId}
        onAddSection={addSection}
        onReorder={reorderSections}
      />

      {/* 중앙 편집 영역 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 상단 바 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white shrink-0">
          <p className="text-sm font-medium text-gray-700">
            {activeSection?.title ?? '섹션을 선택하세요'}
          </p>
          <span className="text-xs text-gray-400">
            {saveStatus === 'saving' && '저장 중...'}
            {saveStatus === 'saved' && '저장됨'}
            {saveStatus === 'error' && '저장 실패'}
          </span>
        </div>

        {/* 편집기 */}
        <div className="flex-1 overflow-hidden">
          {!activeSection ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              왼쪽에서 섹션을 선택하거나 새 섹션을 추가하세요
            </div>
          ) : activeSection.type === 'document' ? (
            <DocumentSectionEditor
              key={activeSection.id}
              content={activeSection.content as CampaignDocumentContent}
              onChange={(content) => updateSection(activeSection.id, { content })}
            />
          ) : activeSection.type === 'data_table' ? (
            <DataTableSectionEditor
              key={activeSection.id}
              content={activeSection.content as CampaignDataTableContent}
              onChange={(content) => updateSection(activeSection.id, { content })}
            />
          ) : (
            <DashboardSectionEditor
              key={activeSection.id}
              content={activeSection.content as CampaignDashboardContent}
              allSections={sections}
              onChange={(content) => updateSection(activeSection.id, { content })}
            />
          )}
        </div>
      </div>

      {/* 우측 설정 패널 */}
      {activeSection && (
        <SectionSettings
          section={activeSection}
          onUpdate={(patch) => updateSection(activeSection.id, patch)}
          onDelete={() => deleteSection(activeSection.id)}
        />
      )}
    </div>
  )
}
