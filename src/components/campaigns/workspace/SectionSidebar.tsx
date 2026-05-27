'use client'

import React, { useState } from 'react'
import { clsx } from 'clsx'
import {
  GripVertical,
  FileText,
  Table2,
  LayoutDashboard,
  Plus,
  Database,
  BarChart2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  CampaignSection,
  CampaignSectionType,
  CampaignDatabase,
  CampaignBusinessType,
} from '@/types'

// ── ActiveView 타입 ──────────────────────────────────────────────

export type ActiveView =
  | { type: 'overview' }
  | { type: 'section'; id: string }
  | { type: 'database'; id: string }

// ── 섹션 타입 메타 ────────────────────────────────────────────────

const SECTION_TYPE_META: Record<CampaignSectionType, { label: string; icon: React.ReactNode }> = {
  document:   { label: '문서',     icon: <FileText size={13} className="shrink-0" /> },
  data_table: { label: '테이블',   icon: <Table2 size={13} className="shrink-0" /> },
  dashboard:  { label: '대시보드', icon: <LayoutDashboard size={13} className="shrink-0" /> },
}

// ── 정렬 가능한 섹션 아이템 ──────────────────────────────────────

interface SortableSectionItemProps {
  section: CampaignSection
  isActive: boolean
  onClick: () => void
}

function SortableSectionItem({ section, isActive, onClick }: SortableSectionItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const meta = SECTION_TYPE_META[section.type]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'flex items-center gap-2 py-1.5 pr-3 cursor-pointer select-none group transition-colors border-l-2',
        isActive
          ? 'bg-blue-50 text-blue-900 border-blue-500 pl-[10px]'
          : 'text-gray-600 border-transparent hover:bg-gray-50 hover:text-gray-800 pl-[10px]'
      )}
      onClick={onClick}
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-gray-500"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <GripVertical size={12} />
      </button>
      <span className={clsx('shrink-0', isActive ? 'text-blue-500' : 'text-gray-400')}>
        {meta.icon}
      </span>
      <span className="flex-1 text-xs font-medium truncate">{section.title}</span>
      <span className={clsx('shrink-0 text-[10px]', isActive ? 'text-blue-400' : 'text-gray-300')}>
        {meta.label}
      </span>
    </div>
  )
}

// ── 데이터베이스 아이템 ───────────────────────────────────────────

function DatabaseItem({
  database,
  isActive,
  onClick,
}: {
  database: CampaignDatabase
  isActive: boolean
  onClick: () => void
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2 py-1.5 pr-3 pl-[10px] cursor-pointer select-none transition-colors border-l-2',
        isActive
          ? 'bg-emerald-50 text-emerald-900 border-emerald-500'
          : 'text-gray-600 border-transparent hover:bg-gray-50 hover:text-gray-800'
      )}
      onClick={onClick}
    >
      <Database
        size={13}
        className={clsx('shrink-0', isActive ? 'text-emerald-500' : 'text-gray-400')}
      />
      <span className="flex-1 text-xs font-medium truncate">{database.title}</span>
      <span className={clsx('shrink-0 text-[10px]', isActive ? 'text-emerald-400' : 'text-gray-300')}>
        {database.rows.length}행
      </span>
    </div>
  )
}

// ── 섹션 그룹 헤더 ────────────────────────────────────────────────

function GroupHeader({
  label,
  open,
  onToggle,
  action,
}: {
  label: string
  open: boolean
  onToggle: () => void
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-1 px-3 py-1.5 mt-2 first:mt-0">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 flex-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-600 transition-colors"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {label}
      </button>
      {action}
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

interface SectionSidebarProps {
  campaignName: string
  clientName: string
  sections: CampaignSection[]
  databases: CampaignDatabase[]
  activeView: ActiveView
  onSelectView: (view: ActiveView) => void
  onAddSection: (type: CampaignSectionType) => void
  onAddDatabase: (businessType: CampaignBusinessType) => void
  onReorder: (sections: CampaignSection[]) => void
}

const ADD_DB_OPTIONS: { type: CampaignBusinessType; label: string }[] = [
  { type: 'influencer_candidates',  label: '후보자 리스트' },
  { type: 'confirmed_influencers',  label: '확정 인원 리스트' },
  { type: 'influencer_performance', label: '인플루언서 성과' },
  { type: 'ad_budget',              label: '광고 예산안' },
  { type: 'schedule',               label: '일정표' },
  { type: 'content_review',         label: '콘텐츠 검수' },
  { type: 'result_report',          label: '결과 리포트' },
  { type: 'other',                  label: '기타' },
]

export function SectionSidebar({
  campaignName,
  clientName,
  sections,
  databases,
  activeView,
  onSelectView,
  onAddSection,
  onAddDatabase,
  onReorder,
}: SectionSidebarProps) {
  const [sectionsOpen, setSectionsOpen] = useState(true)
  const [databasesOpen, setDatabasesOpen] = useState(true)
  const [showDbMenu, setShowDbMenu] = useState(false)
  const [showSectionMenu, setShowSectionMenu] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = sections.findIndex((s) => s.id === active.id)
    const newIdx = sections.findIndex((s) => s.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    onReorder(arrayMove(sections, oldIdx, newIdx))
  }

  return (
    <div
      className="border-r border-gray-200 bg-white flex flex-col h-full overflow-hidden"
      style={{ width: 240 }}
    >
      {/* 캠페인 헤더 */}
      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
        <p className="text-[10px] text-gray-400 truncate mb-0.5">{clientName}</p>
        <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{campaignName}</p>
      </div>

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* 종합 대시보드 */}
        <button
          className={clsx(
            'w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors border-l-2',
            activeView.type === 'overview'
              ? 'bg-blue-50 text-blue-800 border-blue-500'
              : 'text-gray-600 border-transparent hover:bg-gray-50 hover:text-gray-800'
          )}
          onClick={() => onSelectView({ type: 'overview' })}
        >
          <BarChart2
            size={13}
            className={clsx('shrink-0', activeView.type === 'overview' ? 'text-blue-500' : 'text-gray-400')}
          />
          종합 대시보드
        </button>

        {/* 섹션 그룹 */}
        <GroupHeader
          label="문서"
          open={sectionsOpen}
          onToggle={() => setSectionsOpen((v) => !v)}
          action={
            <div className="relative">
              <button
                onClick={() => setShowSectionMenu((v) => !v)}
                className="text-gray-300 hover:text-gray-600 transition-colors p-0.5 rounded"
                title="문서 추가"
              >
                <Plus size={12} />
              </button>
              {showSectionMenu && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-36 py-1">
                  {([
                    { type: 'document' as CampaignSectionType, label: '문서' },
                    { type: 'data_table' as CampaignSectionType, label: '데이터 테이블' },
                    { type: 'dashboard' as CampaignSectionType, label: '대시보드' },
                  ]).map((opt) => (
                    <button
                      key={opt.type}
                      onClick={() => { onAddSection(opt.type); setShowSectionMenu(false) }}
                      className="w-full text-left text-xs text-gray-700 hover:bg-gray-50 px-3 py-1.5"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          }
        />

        {sectionsOpen && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {sections.map((section) => (
                <SortableSectionItem
                  key={section.id}
                  section={section}
                  isActive={activeView.type === 'section' && activeView.id === section.id}
                  onClick={() => onSelectView({ type: 'section', id: section.id })}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}

        {sectionsOpen && sections.length === 0 && (
          <p className="text-[11px] text-gray-400 px-4 py-1">섹션 없음</p>
        )}

        {/* 데이터베이스 그룹 */}
        <GroupHeader
          label="데이터베이스"
          open={databasesOpen}
          onToggle={() => setDatabasesOpen((v) => !v)}
          action={
            <div className="relative">
              <button
                onClick={() => setShowDbMenu((v) => !v)}
                className="text-gray-300 hover:text-gray-600 transition-colors p-0.5 rounded"
                title="데이터베이스 추가"
              >
                <Plus size={12} />
              </button>
              {showDbMenu && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-44 py-1">
                  {ADD_DB_OPTIONS.map((opt) => (
                    <button
                      key={opt.type}
                      onClick={() => { onAddDatabase(opt.type); setShowDbMenu(false) }}
                      className="w-full text-left text-xs text-gray-700 hover:bg-gray-50 px-3 py-1.5"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          }
        />

        {databasesOpen && databases.map((db) => (
          <DatabaseItem
            key={db.id}
            database={db}
            isActive={activeView.type === 'database' && activeView.id === db.id}
            onClick={() => onSelectView({ type: 'database', id: db.id })}
          />
        ))}

        {databasesOpen && databases.length === 0 && (
          <p className="text-[11px] text-gray-400 px-4 py-1">데이터베이스 없음</p>
        )}
      </div>
    </div>
  )
}
