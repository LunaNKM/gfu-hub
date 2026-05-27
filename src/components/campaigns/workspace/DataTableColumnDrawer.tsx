'use client'

import React from 'react'
import { X, Trash2, Plus } from 'lucide-react'
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
import { CampaignDataColumn, CampaignColumnType, CampaignColumnRole } from '@/types'
import { GripVertical } from 'lucide-react'

const COLUMN_TYPES: { value: CampaignColumnType; label: string }[] = [
  { value: 'text',     label: '텍스트' },
  { value: 'number',   label: '숫자' },
  { value: 'currency', label: '금액' },
  { value: 'percent',  label: '퍼센트' },
  { value: 'date',     label: '날짜' },
  { value: 'select',   label: '선택' },
  { value: 'checkbox', label: '체크박스' },
  { value: 'url',      label: 'URL' },
]

const COLUMN_ROLES: { value: CampaignColumnRole | ''; label: string }[] = [
  { value: '',            label: '없음' },
  { value: 'dimension',   label: '분류값' },
  { value: 'metric',      label: '수치값' },
  { value: 'status',      label: '상태' },
  { value: 'platform',    label: '플랫폼' },
  { value: 'cost',        label: '비용' },
  { value: 'performance', label: '성과' },
]

// ── 정렬 가능한 컬럼 행 ──────────────────────────────────────────

interface SortableColRowProps {
  col: CampaignDataColumn
  onUpdate: (patch: Partial<CampaignDataColumn>) => void
  onDelete: () => void
}

function SortableColRow({ col, onUpdate, onDelete }: SortableColRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: col.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 bg-gray-50 rounded-lg p-2.5 group"
    >
      {/* 드래그 핸들 */}
      <button
        {...attributes}
        {...listeners}
        className="mt-2.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0 transition-colors"
        tabIndex={-1}
        aria-label="순서 변경"
      >
        <GripVertical size={13} />
      </button>

      <div className="flex-1 min-w-0 space-y-1.5">
        {/* 컬럼명 */}
        <input
          value={col.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="w-full text-xs font-medium text-gray-800 bg-white border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          placeholder="컬럼명"
        />
        {/* 타입 + 역할 */}
        <div className="flex gap-1.5">
          <select
            value={col.type}
            onChange={(e) => onUpdate({ type: e.target.value as CampaignColumnType })}
            className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-1 bg-white outline-none text-gray-600 focus:border-blue-400"
          >
            {COLUMN_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select
            value={col.role ?? ''}
            onChange={(e) =>
              onUpdate({ role: (e.target.value as CampaignColumnRole) || undefined })
            }
            className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-1 bg-white outline-none text-gray-600 focus:border-blue-400"
          >
            {COLUMN_ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 삭제 */}
      <button
        onClick={() => {
          if (confirm(`"${col.name}" 컬럼을 삭제할까요?`)) onDelete()
        }}
        className="mt-1.5 text-gray-300 hover:text-red-500 transition-colors shrink-0 p-0.5"
        title="컬럼 삭제"
        aria-label={`${col.name} 컬럼 삭제`}
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────

interface DataTableColumnDrawerProps {
  open: boolean
  columns: CampaignDataColumn[]
  onClose: () => void
  onUpdate: (colId: string, patch: Partial<CampaignDataColumn>) => void
  onDelete: (colId: string) => void
  onAdd: () => void
  onReorder: (newColumns: CampaignDataColumn[]) => void
}

export function DataTableColumnDrawer({
  open,
  columns,
  onClose,
  onUpdate,
  onDelete,
  onAdd,
  onReorder,
}: DataTableColumnDrawerProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = columns.findIndex((c) => c.id === active.id)
    const newIdx = columns.findIndex((c) => c.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    onReorder(arrayMove(columns, oldIdx, newIdx))
  }

  if (!open) return null

  return (
    <>
      {/* 오버레이 */}
      <div className="fixed inset-0 z-40 bg-black/10" onClick={onClose} />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 h-full z-50 bg-white border-l border-gray-200 flex flex-col shadow-xl"
        style={{ width: 360 }}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-sm font-semibold text-gray-800">컬럼 설정</p>
            <p className="text-xs text-gray-400 mt-0.5">
              드래그로 순서를 변경하고, 이름·타입·역할을 수정하세요.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        {/* 컬럼 리스트 (드래그 정렬) */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {columns.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">컬럼이 없습니다.</p>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={columns.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {columns.map((col) => (
                  <SortableColRow
                    key={col.id}
                    col={col}
                    onUpdate={(patch) => onUpdate(col.id, patch)}
                    onDelete={() => onDelete(col.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* 컬럼 추가 */}
        <div className="px-4 py-3 border-t border-gray-100 shrink-0">
          <button
            onClick={onAdd}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 py-2 border border-blue-200 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            <Plus size={12} /> 컬럼 추가
          </button>
        </div>
      </div>
    </>
  )
}
