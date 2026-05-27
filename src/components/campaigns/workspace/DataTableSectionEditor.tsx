'use client'

import React, { useState, useCallback, useMemo, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import {
  ModuleRegistry,
  AllCommunityModule,
  ColDef,
  GridReadyEvent,
  CellValueChangedEvent,
} from 'ag-grid-community'
import { Plus, Trash2, ChevronDown } from 'lucide-react'
import { CampaignDataTableContent, CampaignDataColumn, CampaignDataRow, CampaignColumnType, CampaignColumnRole } from '@/types'
import { normalizeCellValue } from './workspaceUtils'

ModuleRegistry.registerModules([AllCommunityModule])

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
  { value: 'dimension',   label: '차원' },
  { value: 'metric',      label: '지표' },
  { value: 'status',      label: '상태' },
  { value: 'platform',    label: '플랫폼' },
  { value: 'cost',        label: '비용' },
  { value: 'performance', label: '성과' },
]

interface Props {
  content: CampaignDataTableContent
  onChange: (content: CampaignDataTableContent) => void
}

interface RowData {
  _id: string
  [key: string]: string | number | boolean | null | undefined
}

function colsToAgDefs(columns: CampaignDataColumn[]): ColDef[] {
  return columns.map((col, index) => ({
    field: col.id,
    headerName: col.name,
    editable: true,
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 100,
    ...(index === 0
      ? {
          checkboxSelection: true,
          headerCheckboxSelection: true,
        }
      : {}),
    ...(col.type === 'checkbox'
      ? { cellDataType: 'boolean', cellRenderer: 'agCheckboxCellRenderer', cellEditor: 'agCheckboxCellEditor' }
      : {}),
  }))
}

function rowsToAgData(rows: CampaignDataRow[]): RowData[] {
  return rows.map((r) => ({ _id: r.id, ...r.cells }))
}

function agDataToRows(agRows: RowData[], columns: CampaignDataColumn[]): CampaignDataRow[] {
  return agRows.map((r) => {
    const cells: CampaignDataRow['cells'] = {}
    for (const col of columns) {
      cells[col.id] = normalizeCellValue(r[col.id], col.type) as string | number | boolean | null
    }
    return { id: String(r._id), cells }
  })
}

export function DataTableSectionEditor({ content, onChange }: Props) {
  const { columns, rows } = content
  const gridRef = useRef<AgGridReact<RowData>>(null)
  const [showColPanel, setShowColPanel] = useState(false)

  const agColumns = useMemo(() => colsToAgDefs(columns), [columns])
  const agData = useMemo(() => rowsToAgData(rows), [rows])

  const getCurrentRows = useCallback((): CampaignDataRow[] => {
    const api = gridRef.current?.api
    if (!api) return rows
    const agRows: RowData[] = []
    api.forEachNode((node) => { if (node.data) agRows.push(node.data) })
    return agDataToRows(agRows, columns)
  }, [columns, rows])

  const onGridReady = useCallback((_params: GridReadyEvent) => {}, [])

  const onCellValueChanged = useCallback(
    (_event: CellValueChangedEvent<RowData>) => {
      onChange({ columns, rows: getCurrentRows() })
    },
    [columns, getCurrentRows, onChange]
  )

  const addRow = useCallback(() => {
    const cells: CampaignDataRow['cells'] = {}
    for (const col of columns) cells[col.id] = null
    const newRow: CampaignDataRow = { id: `row_${Date.now()}`, cells }
    onChange({ columns, rows: [...getCurrentRows(), newRow] })
  }, [columns, getCurrentRows, onChange])

  const deleteSelectedRows = useCallback(() => {
    const api = gridRef.current?.api
    if (!api) return
    const selected = api.getSelectedNodes().map((n) => n.data?._id)
    if (selected.length === 0) return
    const newRows = getCurrentRows().filter((r) => !selected.includes(r.id))
    onChange({ columns, rows: newRows })
  }, [columns, getCurrentRows, onChange])

  const addColumn = useCallback(() => {
    const newCol: CampaignDataColumn = {
      id: `col_${Date.now()}`,
      name: '새 컬럼',
      type: 'text',
    }
    const newColumns = [...columns, newCol]
    const newRows = getCurrentRows().map((r) => ({
      ...r,
      cells: { ...r.cells, [newCol.id]: null },
    }))
    onChange({ columns: newColumns, rows: newRows })
  }, [columns, getCurrentRows, onChange])

  const deleteColumn = useCallback(
    (colId: string) => {
      const newColumns = columns.filter((c) => c.id !== colId)
      const newRows = getCurrentRows().map((r) => {
        const cells = { ...r.cells }
        delete cells[colId]
        return { ...r, cells }
      })
      onChange({ columns: newColumns, rows: newRows })
    },
    [columns, getCurrentRows, onChange]
  )

  const updateColumn = useCallback(
    (colId: string, patch: Partial<CampaignDataColumn>) => {
      const newColumns = columns.map((c) => (c.id === colId ? { ...c, ...patch } : c))
      onChange({ columns: newColumns, rows: getCurrentRows() })
    },
    [columns, getCurrentRows, onChange]
  )

  return (
    <div className="flex flex-col h-full">
      {/* 컬럼 관리 패널 토글 */}
      <div className="border-b border-gray-200 bg-gray-50 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            onClick={() => setShowColPanel((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-800 px-2 py-1 border border-gray-200 rounded bg-white"
          >
            <ChevronDown size={12} className={showColPanel ? 'rotate-180 transition-transform' : 'transition-transform'} />
            컬럼 관리
          </button>
          <button
            onClick={addColumn}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 border border-blue-200 rounded bg-blue-50"
          >
            <Plus size={12} /> 컬럼 추가
          </button>
          <button
            onClick={addRow}
            className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 px-2 py-1 border border-green-200 rounded bg-green-50"
          >
            <Plus size={12} /> 행 추가
          </button>
          <button
            onClick={deleteSelectedRows}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1 border border-red-200 rounded bg-red-50"
          >
            <Trash2 size={12} /> 선택 행 삭제
          </button>
        </div>

        {showColPanel && columns.length > 0 && (
          <div className="border-t border-gray-200 px-3 py-2 overflow-x-auto">
            <div className="flex gap-3 min-w-max">
              {columns.map((col) => (
                <div key={col.id} className="bg-white border border-gray-200 rounded p-2 min-w-44">
                  <input
                    value={col.name}
                    onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                    className="w-full text-xs font-medium border-b border-gray-100 pb-1 mb-1.5 outline-none focus:border-blue-400"
                  />
                  <div className="flex gap-1 flex-wrap">
                    <select
                      value={col.type}
                      onChange={(e) => updateColumn(col.id, { type: e.target.value as CampaignColumnType })}
                      className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white outline-none"
                    >
                      {COLUMN_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <select
                      value={col.role ?? ''}
                      onChange={(e) => updateColumn(col.id, { role: (e.target.value as CampaignColumnRole) || undefined })}
                      className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white outline-none"
                    >
                      {COLUMN_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => deleteColumn(col.id)}
                      className="text-xs text-red-400 hover:text-red-600 px-1.5 py-0.5 border border-red-100 rounded bg-red-50"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AG Grid */}
      <div className="flex-1 ag-theme-quartz overflow-hidden">
        {columns.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            컬럼을 추가하여 테이블을 시작하세요
          </div>
        ) : (
          <div style={{ height: '100%', width: '100%' }}>
            <AgGridReact<RowData>
              ref={gridRef}
              rowData={agData}
              columnDefs={agColumns}
              onGridReady={onGridReady}
              onCellValueChanged={onCellValueChanged}
              rowSelection="multiple"
              suppressRowClickSelection
              enableCellTextSelection
              stopEditingWhenCellsLoseFocus
              defaultColDef={{
                editable: true,
                resizable: true,
                sortable: true,
                filter: true,
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
