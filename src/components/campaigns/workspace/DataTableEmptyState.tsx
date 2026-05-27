'use client'

import React from 'react'
import { TableProperties, Plus } from 'lucide-react'

interface DataTableEmptyStateProps {
  onAddRow: () => void
  onAddSampleRows: () => void
}

export function DataTableEmptyState({ onAddRow, onAddSampleRows }: DataTableEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
          <TableProperties size={18} className="text-gray-400" />
        </div>
        <p className="text-sm font-medium text-gray-500">아직 데이터가 없습니다</p>
        <p className="text-xs text-gray-400">
          행을 추가하거나 스프레드시트에서 데이터를 붙여넣어 시작하세요.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onAddRow}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 px-3 py-1.5 border border-blue-200 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors"
        >
          <Plus size={13} /> 첫 행 추가
        </button>
        <button
          onClick={onAddSampleRows}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-50 transition-colors"
        >
          샘플 행 추가
        </button>
      </div>
    </div>
  )
}
