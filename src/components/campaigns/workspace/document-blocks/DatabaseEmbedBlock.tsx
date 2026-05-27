'use client'

import { useMemo } from 'react'
import { Database } from 'lucide-react'
import type {
  CampaignBlock,
  CampaignCellValue,
  CampaignDataColumn,
  CampaignDataTableContent,
  CampaignDatabase,
} from '@/types'
import { DataTableSectionEditor, type DataTableHandlers } from '../DataTableSectionEditor'

export function DatabaseEmbedBlock({
  block,
  databases,
  onUpdate,
  onCellChange,
  onRowAdd,
  onRowsDelete,
  onColumnsChange,
}: {
  block: CampaignBlock
  databases: CampaignDatabase[]
  onUpdate: (content: Record<string, unknown>) => void
  onCellChange?: (databaseId: string, rowId: string, colId: string, value: CampaignCellValue) => void
  onRowAdd?: (databaseId: string) => void
  onRowsDelete?: (databaseId: string, rowIds: string[]) => void
  onColumnsChange?: (databaseId: string, columns: CampaignDataColumn[]) => void
}) {
  const databaseId = String(block.content.databaseId ?? '')
  const database = databases.find((item) => item.id === databaseId)

  const handleTableChange = (content: CampaignDataTableContent) => {
    if (!database || !onColumnsChange) return
    onColumnsChange(database.id, content.columns)
  }

  const handlers = useMemo<DataTableHandlers | undefined>(() => {
    if (!database || (!onCellChange && !onRowAdd && !onRowsDelete && !onColumnsChange)) {
      return undefined
    }

    return {
      onCellChange: onCellChange
        ? (rowId, colId, value) => onCellChange(database.id, rowId, colId, value)
        : undefined,
      onRowAdd: onRowAdd ? () => onRowAdd(database.id) : undefined,
      onRowsDelete: onRowsDelete ? (rowIds) => onRowsDelete(database.id, rowIds) : undefined,
      onColumnsChange: onColumnsChange ? (columns) => onColumnsChange(database.id, columns) : undefined,
    }
  }, [database, onCellChange, onRowAdd, onRowsDelete, onColumnsChange])

  return (
    <div className="overflow-hidden rounded-lg border border-[#e9e9e7] bg-white">
      <div className="flex items-center justify-between border-b border-[#e9e9e7] bg-[#f7f7f5] px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
          <Database size={13} className="text-gray-400" />
          데이터베이스
        </div>
        <select
          value={databaseId}
          onChange={(event) => onUpdate({ ...block.content, databaseId: event.target.value })}
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs outline-none"
        >
          <option value="">선택</option>
          {databases.map((item) => (
            <option key={item.id} value={item.id}>{item.title}</option>
          ))}
        </select>
      </div>

      {!database ? (
        <div className="p-5 text-center text-xs text-gray-400">삽입할 데이터베이스를 선택하세요.</div>
      ) : (
        <div className="bg-white">
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-sm font-semibold text-gray-800">{database.title}</p>
            <p className="text-xs text-gray-400">{database.rows.length}개 행 · {database.columns.length}개 컬럼</p>
          </div>
          <div className="h-[360px] border-t border-[#e9e9e7] bg-white">
            <DataTableSectionEditor
              compact
              content={{ columns: database.columns, rows: database.rows }}
              onChange={handleTableChange}
              handlers={handlers}
            />
          </div>
        </div>
      )}
    </div>
  )
}
