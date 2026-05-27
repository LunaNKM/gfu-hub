'use client'

import React, { useState } from 'react'
import { Database } from 'lucide-react'
import { CampaignDatabase, CampaignDataTableContent, CampaignBusinessType, CampaignCellValue, CampaignDataColumn } from '@/types'
import { DataTableSectionEditor, type DataTableHandlers } from './DataTableSectionEditor'
import { BUSINESS_TYPE_TITLES } from '@/lib/campaigns/databaseTemplates'

const BUSINESS_TYPE_LABELS: Record<CampaignBusinessType, string> = BUSINESS_TYPE_TITLES

interface Props {
  database: CampaignDatabase
  onChange: (patch: Partial<CampaignDatabase>) => void
  onCellChange?: (rowId: string, colId: string, value: CampaignCellValue) => void
  onRowAdd?: () => void
  onRowsDelete?: (rowIds: string[]) => void
  onColumnsChange?: (columns: CampaignDataColumn[]) => void
  onExpandRow?: (rowId: string) => void
}

export function CampaignDatabaseEditor({
  database,
  onChange,
  onCellChange,
  onRowAdd,
  onRowsDelete,
  onColumnsChange,
  onExpandRow,
}: Props) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(database.title)

  const commitTitle = () => {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== database.title) {
      onChange({ title: trimmed })
    } else {
      setTitleDraft(database.title)
    }
    setEditingTitle(false)
  }

  // DataTableSectionEditor expects CampaignDataTableContent
  const tableContent: CampaignDataTableContent = {
    columns: database.columns,
    rows: database.rows,
  }

  // handlers 모드가 있을 때 granular 핸들러 사용
  const handlers: DataTableHandlers | undefined =
    onCellChange || onRowAdd || onRowsDelete || onColumnsChange || onExpandRow
      ? {
          onCellChange,
          onRowAdd,
          onRowsDelete,
          onColumnsChange,
          onExpandRow,
        }
      : undefined

  // legacy fallback: handlers 없을 때 onChange로 전체 저장
  const handleTableChange = (content: CampaignDataTableContent) => {
    onChange({ columns: content.columns, rows: content.rows })
  }

  const businessLabel = BUSINESS_TYPE_LABELS[database.businessType] ?? database.businessType

  return (
    <div className="flex h-full flex-col bg-white">
      {/* 헤더 */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[#e9e9e7] bg-white px-5 py-3">
        <Database size={15} className="text-gray-400 shrink-0" />
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') { setTitleDraft(database.title); setEditingTitle(false) }
              }}
              className="text-sm font-semibold text-gray-900 bg-transparent border-b border-blue-400 outline-none w-full"
            />
          ) : (
            <button
              className="text-sm font-semibold text-gray-900 hover:text-blue-700 transition-colors text-left"
              onDoubleClick={() => { setTitleDraft(database.title); setEditingTitle(true) }}
              title="더블클릭으로 이름 변경"
            >
              {database.title}
            </button>
          )}
          <p className="text-xs text-gray-400 mt-0.5">{businessLabel}</p>
        </div>
      </div>

      {/* 테이블 에디터 */}
      <div className="flex-1 overflow-hidden bg-white">
        <DataTableSectionEditor
          key={database.id}
          content={tableContent}
          onChange={handleTableChange}
          handlers={handlers}
        />
      </div>
    </div>
  )
}
