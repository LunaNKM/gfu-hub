'use client'

import React, { useState } from 'react'
import { Database } from 'lucide-react'
import { CampaignDatabase, CampaignDataTableContent, CampaignBusinessType } from '@/types'
import { DataTableSectionEditor } from './DataTableSectionEditor'
import { BUSINESS_TYPE_TITLES } from '@/lib/campaigns/databaseTemplates'

const BUSINESS_TYPE_LABELS: Record<CampaignBusinessType, string> = BUSINESS_TYPE_TITLES

interface Props {
  database: CampaignDatabase
  onChange: (patch: Partial<CampaignDatabase>) => void
}

export function CampaignDatabaseEditor({ database, onChange }: Props) {
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

  const handleTableChange = (content: CampaignDataTableContent) => {
    onChange({ columns: content.columns, rows: content.rows })
  }

  const businessLabel = BUSINESS_TYPE_LABELS[database.businessType] ?? database.businessType

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="border-b border-gray-100 bg-white px-5 py-3 flex items-center gap-3 shrink-0">
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

      {/* 테이블 에디터 (기존 DataTableSectionEditor 재사용) */}
      <div className="flex-1 overflow-hidden">
        <DataTableSectionEditor
          key={database.id}
          content={tableContent}
          onChange={handleTableChange}
        />
      </div>
    </div>
  )
}
