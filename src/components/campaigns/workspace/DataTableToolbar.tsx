'use client'

import React from 'react'
import { Plus, SlidersHorizontal, Trash2 } from 'lucide-react'

interface DataTableToolbarProps {
  rowCount: number
  columnCount: number
  selectedCount: number
  onAddRow: () => void
  onAddColumn: () => void
  onOpenColumnDrawer: () => void
  onDeleteSelected: () => void
}

export function DataTableToolbar({
  rowCount,
  columnCount,
  selectedCount,
  onAddRow,
  onAddColumn,
  onOpenColumnDrawer,
  onDeleteSelected,
}: DataTableToolbarProps) {
  const ghost =
    'flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-50 transition-colors'
  const primary =
    'flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 px-2.5 py-1.5 border border-blue-200 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors'

  return (
    <div className="border-b border-gray-100 bg-white shrink-0 px-3 py-2 flex items-center gap-2">
      {/* 좌측 — 통계 */}
      {(rowCount > 0 || columnCount > 0) && (
        <div className="flex items-center gap-3 text-xs text-gray-400 mr-1 select-none">
          {rowCount > 0 && <span>{rowCount}개 행</span>}
          {columnCount > 0 && <span>{columnCount}개 컬럼</span>}
        </div>
      )}

      {/* 컬럼 설정 */}
      <button onClick={onOpenColumnDrawer} className={ghost}>
        <SlidersHorizontal size={12} />
        컬럼 설정
      </button>

      {/* 컬럼 추가 */}
      <button onClick={onAddColumn} className={ghost}>
        <Plus size={12} />
        컬럼
      </button>

      {/* 행 추가 */}
      <button onClick={onAddRow} className={primary}>
        <Plus size={12} />행
      </button>

      {/* 선택 행 삭제 — 선택 시에만 표시 */}
      {selectedCount > 0 && (
        <button
          onClick={onDeleteSelected}
          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 px-2.5 py-1.5 border border-red-200 rounded-md bg-red-50 hover:bg-red-100 transition-colors"
        >
          <Trash2 size={12} />
          {selectedCount}개 행 삭제
        </button>
      )}
    </div>
  )
}
