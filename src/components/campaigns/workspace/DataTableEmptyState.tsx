'use client'

import React from 'react'
import { Plus, Table2 } from 'lucide-react'

interface DataTableEmptyStateProps {
  onAddRow: () => void
  onAddSampleRows: () => void
}

export function DataTableEmptyState({ onAddRow, onAddSampleRows }: DataTableEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #e0e7ff 0%, #dbeafe 100%)' }}
        >
          <Table2 size={20} className="text-indigo-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700">아직 데이터가 없습니다</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            행을 추가하거나<br />스프레드시트에서 복사·붙여넣기로 시작하세요.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onAddRow}
          className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 px-3.5 py-2 border border-indigo-200 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors"
        >
          <Plus size={13} /> 첫 행 추가
        </button>
        <button
          onClick={onAddSampleRows}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 px-3.5 py-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
        >
          샘플 데이터
        </button>
      </div>
    </div>
  )
}
