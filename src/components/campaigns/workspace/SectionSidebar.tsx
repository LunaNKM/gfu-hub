'use client'

import React from 'react'
import { clsx } from 'clsx'
import { GripVertical, FileText, Table2, LayoutDashboard, Plus } from 'lucide-react'
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
import { CampaignSection, CampaignSectionType } from '@/types'

const TYPE_META: Record<CampaignSectionType, { label: string; icon: React.ReactNode; badge: string }> = {
  document:   { label: '문서',        icon: <FileText size={13} />,        badge: 'bg-blue-100 text-blue-700' },
  data_table: { label: '데이터 테이블', icon: <Table2 size={13} />,          badge: 'bg-green-100 text-green-700' },
  dashboard:  { label: '대시보드',    icon: <LayoutDashboard size={13} />,  badge: 'bg-purple-100 text-purple-700' },
}

interface SortableItemProps {
  section: CampaignSection
  isActive: boolean
  onClick: () => void
}

function SortableItem({ section, isActive, onClick }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const meta = TYPE_META[section.type]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'flex items-center gap-2 px-3 py-2 rounded cursor-pointer select-none group',
        isActive
          ? 'bg-blue-600 text-white'
          : 'hover:bg-gray-100 text-gray-700'
      )}
      onClick={onClick}
    >
      <button
        {...attributes}
        {...listeners}
        className={clsx(
          'shrink-0 cursor-grab active:cursor-grabbing p-0.5 rounded',
          isActive ? 'text-blue-200 hover:text-white' : 'text-gray-300 hover:text-gray-500'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={14} />
      </button>
      <span className="shrink-0">{meta.icon}</span>
      <span className="flex-1 text-sm truncate">{section.title}</span>
      <span
        className={clsx(
          'shrink-0 text-xs px-1.5 py-0.5 rounded font-medium',
          isActive ? 'bg-blue-500 text-blue-100' : meta.badge
        )}
      >
        {meta.label}
      </span>
    </div>
  )
}

interface SectionSidebarProps {
  campaignName: string
  clientName: string
  sections: CampaignSection[]
  activeSectionId: string | null
  onSelectSection: (id: string) => void
  onAddSection: (type: CampaignSectionType) => void
  onReorder: (sections: CampaignSection[]) => void
}

export function SectionSidebar({
  campaignName,
  clientName,
  sections,
  activeSectionId,
  onSelectSection,
  onAddSection,
  onReorder,
}: SectionSidebarProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = sections.findIndex((s) => s.id === active.id)
    const newIdx = sections.findIndex((s) => s.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    onReorder(arrayMove(sections, oldIdx, newIdx))
  }

  const addButtons: { type: CampaignSectionType; label: string; icon: React.ReactNode }[] = [
    { type: 'document',   label: '+ 문서',          icon: <FileText size={12} /> },
    { type: 'data_table', label: '+ 데이터 테이블', icon: <Table2 size={12} /> },
    { type: 'dashboard',  label: '+ 대시보드',      icon: <LayoutDashboard size={12} /> },
  ]

  return (
    <div className="w-70 border-r border-gray-200 bg-white flex flex-col h-full overflow-hidden" style={{ width: 280 }}>
      {/* 캠페인 헤더 */}
      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
        <p className="text-xs text-gray-400 truncate">{clientName}</p>
        <p className="text-sm font-semibold text-gray-900 truncate mt-0.5">{campaignName}</p>
      </div>

      {/* 섹션 목록 */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {sections.map((section) => (
              <SortableItem
                key={section.id}
                section={section}
                isActive={activeSectionId === section.id}
                onClick={() => onSelectSection(section.id)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {sections.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">섹션이 없습니다</p>
        )}
      </div>

      {/* 섹션 추가 버튼 */}
      <div className="border-t border-gray-100 px-2 py-2 shrink-0 space-y-1">
        {addButtons.map((btn) => (
          <button
            key={btn.type}
            onClick={() => onAddSection(btn.type)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded transition-colors"
          >
            <Plus size={11} />
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  )
}
