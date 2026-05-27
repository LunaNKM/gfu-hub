'use client'

import React, { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import {
  BarChart2,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  GripVertical,
  Plus,
  Table2,
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
import type {
  CampaignBusinessType,
  CampaignDatabase,
  CampaignSection,
  CampaignSectionType,
} from '@/types'
import { getColor } from '@/lib/palette'

export type ActiveView =
  | { type: 'overview' }
  | { type: 'section'; id: string }
  | { type: 'database'; id: string }

const SECTION_TYPE_META: Record<CampaignSectionType, { label: string; icon: React.ReactNode }> = {
  document: { label: '문서', icon: <FileText size={13} className="shrink-0" /> },
  data_table: { label: '테이블', icon: <Table2 size={13} className="shrink-0" /> },
  dashboard: { label: 'Legacy', icon: <BarChart2 size={13} className="shrink-0" /> },
}

const ADD_SECTION_OPTIONS: { type: CampaignSectionType; label: string }[] = [
  { type: 'document', label: '문서' },
  { type: 'data_table', label: '데이터 테이블' },
]

const ADD_DB_OPTIONS: { type: CampaignBusinessType; label: string }[] = [
  { type: 'influencer_candidates', label: '후보자 리스트' },
  { type: 'confirmed_influencers', label: '확정 인원 리스트' },
  { type: 'influencer_performance', label: '인플루언서 성과' },
  { type: 'ad_budget', label: '광고 예산안' },
  { type: 'schedule', label: '일정표' },
  { type: 'content_review', label: '콘텐츠 검수' },
  { type: 'result_report', label: '결과 리포트' },
  { type: 'other', label: '기타' },
]

type MenuState =
  | { type: 'sections'; rect: DOMRect }
  | { type: 'databases'; rect: DOMRect }
  | null

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
  const [menu, setMenu] = useState<MenuState>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = sections.findIndex((section) => section.id === active.id)
    const newIdx = sections.findIndex((section) => section.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    onReorder(arrayMove(sections, oldIdx, newIdx))
  }

  return (
    <div className="flex h-full w-60 flex-col overflow-hidden border-r border-gray-200 bg-white">
      <div className="shrink-0 border-b border-gray-100 px-4 py-3">
        <p className="mb-0.5 truncate text-[10px] text-gray-400">{clientName}</p>
        <p className="truncate text-sm font-semibold leading-tight text-gray-900">{campaignName}</p>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        <button
          className={clsx(
            'flex w-full items-center gap-2 border-l-2 px-3 py-2 text-xs font-medium transition-colors',
            activeView.type === 'overview'
              ? 'border-blue-500 bg-blue-50 text-blue-800'
              : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-800'
          )}
          onClick={() => onSelectView({ type: 'overview' })}
        >
          <BarChart2 size={13} className={clsx('shrink-0', activeView.type === 'overview' ? 'text-blue-500' : 'text-gray-400')} />
          종합 대시보드
        </button>

        <GroupHeader
          label="문서"
          open={sectionsOpen}
          onToggle={() => setSectionsOpen((value) => !value)}
          onActionClick={(rect) => setMenu({ type: 'sections', rect })}
        />

        {sectionsOpen && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sections.map((section) => section.id)} strategy={verticalListSortingStrategy}>
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
          <p className="px-4 py-1 text-[11px] text-gray-400">섹션 없음</p>
        )}

        <GroupHeader
          label="데이터베이스"
          open={databasesOpen}
          onToggle={() => setDatabasesOpen((value) => !value)}
          onActionClick={(rect) => setMenu({ type: 'databases', rect })}
        />

        {databasesOpen && databases.map((database) => (
          <DatabaseItem
            key={database.id}
            database={database}
            isActive={activeView.type === 'database' && activeView.id === database.id}
            onClick={() => onSelectView({ type: 'database', id: database.id })}
          />
        ))}

        {databasesOpen && databases.length === 0 && (
          <p className="px-4 py-1 text-[11px] text-gray-400">데이터베이스 없음</p>
        )}
      </div>

      {menu && (
        <FixedMenu
          rect={menu.rect}
          onClose={() => setMenu(null)}
          items={
            menu.type === 'sections'
              ? ADD_SECTION_OPTIONS.map((option) => ({
                  key: option.type,
                  label: option.label,
                  onClick: () => onAddSection(option.type),
                }))
              : ADD_DB_OPTIONS.map((option) => ({
                  key: option.type,
                  label: option.label,
                  onClick: () => onAddDatabase(option.type),
                }))
          }
        />
      )}
    </div>
  )
}

function GroupHeader({
  label,
  open,
  onToggle,
  onActionClick,
}: {
  label: string
  open: boolean
  onToggle: () => void
  onActionClick: (rect: DOMRect) => void
}) {
  return (
    <div className="mt-2 flex items-center gap-1 px-3 py-1.5 first:mt-0">
      <button onClick={onToggle} className="flex flex-1 items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 transition-colors hover:text-gray-600">
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {label}
      </button>
      <button
        onClick={(event) => onActionClick(event.currentTarget.getBoundingClientRect())}
        className="rounded p-0.5 text-gray-300 transition-colors hover:text-gray-600"
        title={`${label} 추가`}
      >
        <Plus size={12} />
      </button>
    </div>
  )
}

function FixedMenu({
  rect,
  items,
  onClose,
}: {
  rect: DOMRect
  items: { key: string; label: string; onClick: () => void }[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-[1000] w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
      style={{ left: rect.left, top: rect.bottom + 4 }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => {
            item.onClick()
            onClose()
          }}
          className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-[#f7f7f5]"
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function SortableSectionItem({ section, isActive, onClick }: { section: CampaignSection; isActive: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })
  const meta = SECTION_TYPE_META[section.type]

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={clsx(
        'group flex cursor-pointer select-none items-center gap-2 border-l-2 py-1.5 pr-3 transition-colors',
        isActive ? 'border-blue-500 bg-blue-50 pl-[10px] text-blue-900' : 'border-transparent pl-[10px] text-gray-600 hover:bg-gray-50 hover:text-gray-800'
      )}
      onClick={onClick}
    >
      <button {...attributes} {...listeners} className="shrink-0 cursor-grab rounded p-0.5 text-gray-300 opacity-0 transition-opacity hover:text-gray-500 group-hover:opacity-100 active:cursor-grabbing" onClick={(event) => event.stopPropagation()} tabIndex={-1}>
        <GripVertical size={12} />
      </button>
      <span className={clsx('shrink-0', isActive ? 'text-blue-500' : 'text-gray-400')}>{meta.icon}</span>
      <span className="flex-1 truncate text-xs font-medium">{section.title}</span>
      <span className={clsx('shrink-0 text-[10px]', isActive ? 'text-blue-400' : 'text-gray-300')}>{meta.label}</span>
    </div>
  )
}

function DatabaseItem({ database, isActive, onClick }: { database: CampaignDatabase; isActive: boolean; onClick: () => void }) {
  const palette = database.color ? getColor(database.color) : null
  const activeBg = palette ? palette.bgSoft : '#ecfdf5'
  const activeText = palette ? palette.text : '#065f46'
  const activeBorder = palette ? palette.bg : '#10b981'
  const activeIcon = palette ? palette.bg : '#10b981'

  return (
    <div
      className="flex cursor-pointer select-none items-center gap-2 border-l-2 py-1.5 pl-[10px] pr-3 transition-colors"
      style={isActive
        ? { borderLeftColor: activeBorder, background: activeBg, color: activeText }
        : { borderLeftColor: 'transparent', color: '#4b5563' }
      }
      onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = '#f9fafb' }}
      onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = '' }}
      onClick={onClick}
    >
      <Database
        size={13}
        className="shrink-0"
        style={{ color: isActive ? activeIcon : (palette?.bg ?? '#9ca3af') }}
      />
      <span className="flex-1 truncate text-xs font-medium">{database.title}</span>
      <span className="shrink-0 text-[10px]" style={{ color: isActive ? activeText : '#d1d5db' }}>
        {database.rows.length}행
      </span>
    </div>
  )
}
