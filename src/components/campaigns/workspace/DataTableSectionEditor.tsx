'use client'

import React, { useState, useCallback, useMemo, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import './dataTableTheme.css'
import {
  ModuleRegistry,
  AllCommunityModule,
  ColDef,
  CellValueChangedEvent,
  SelectionChangedEvent,
} from 'ag-grid-community'
import {
  Plus,
  Type,
  Hash,
  CircleDollarSign,
  Percent,
  Calendar,
  List,
  CheckSquare,
  Link,
  TableProperties,
} from 'lucide-react'
import {
  CampaignDataTableContent,
  CampaignDataColumn,
  CampaignDataRow,
  CampaignColumnType,
} from '@/types'
import { normalizeCellValue, tagColor } from './workspaceUtils'
import { createEmptyRow, createSampleRows } from './dataTableTemplates'
import { DataTableToolbar } from './DataTableToolbar'
import { DataTableColumnDrawer } from './DataTableColumnDrawer'
import { DataTableEmptyState } from './DataTableEmptyState'

ModuleRegistry.registerModules([AllCommunityModule])

// ── 타입 아이콘 매핑 ─────────────────────────────────────────────

const TYPE_ICONS: Record<CampaignColumnType, React.ElementType> = {
  text:     Type,
  number:   Hash,
  currency: CircleDollarSign,
  percent:  Percent,
  date:     Calendar,
  select:   List,
  checkbox: CheckSquare,
  url:      Link,
}

// ── AG Grid 커스텀 헤더 컴포넌트 ─────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function TypedHeader(params: any) {
  const colType: CampaignColumnType = params.colType ?? 'text'
  const Icon = TYPE_ICONS[colType] ?? Type
  return (
    <div className="flex items-center gap-1.5 w-full overflow-hidden">
      <Icon size={12} style={{ color: '#9ca3af', flexShrink: 0 }} />
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: '#6b7280',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {params.displayName}
      </span>
    </div>
  )
}

// ── 태그 셀 렌더러 ────────────────────────────────────────────────

function TagCellRenderer(params: any) {
  const val = params.value
  if (val === null || val === undefined || val === '') return null
  const str = String(val)
  const { bg, text } = tagColor(str)
  return (
    <span
      style={{
        backgroundColor: bg,
        color: text,
        padding: '1px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 500,
        display: 'inline-block',
        lineHeight: '18px',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {str}
    </span>
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── 데이터 변환 ──────────────────────────────────────────────────

interface RowData {
  _id: string
  [key: string]: string | number | boolean | null | undefined
}

function colsToAgDefs(columns: CampaignDataColumn[]): ColDef[] {
  return columns.map((col, index) => {
    const isTagCol =
      col.type === 'select' || col.role === 'status' || col.role === 'platform'
    const isCheckbox = col.type === 'checkbox'

    return {
      field: col.id,
      headerName: col.name,
      editable: true,
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: 100,
      headerComponent: TypedHeader,
      headerComponentParams: { colType: col.type },
      ...(index === 0
        ? { checkboxSelection: true, headerCheckboxSelection: true }
        : {}),
      ...(isCheckbox
        ? {
            cellDataType: 'boolean',
            cellRenderer: 'agCheckboxCellRenderer',
            cellEditor: 'agCheckboxCellEditor',
          }
        : {}),
      ...(!isCheckbox && isTagCol
        ? {
            cellRenderer: TagCellRenderer,
            cellRendererParams: { colType: col.type, colRole: col.role },
          }
        : {}),
    }
  })
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

// ── 메인 컴포넌트 ────────────────────────────────────────────────

interface Props {
  content: CampaignDataTableContent
  onChange: (content: CampaignDataTableContent) => void
}

export function DataTableSectionEditor({ content, onChange }: Props) {
  const { columns, rows } = content
  const gridRef = useRef<AgGridReact<RowData>>(null)
  const [showColumnDrawer, setShowColumnDrawer] = useState(false)
  const [selectedCount, setSelectedCount] = useState(0)

  const agColumns = useMemo(() => colsToAgDefs(columns), [columns])
  const agData = useMemo(() => rowsToAgData(rows), [rows])

  const getCurrentRows = useCallback((): CampaignDataRow[] => {
    const api = gridRef.current?.api
    if (!api) return rows
    const agRows: RowData[] = []
    api.forEachNode((node) => { if (node.data) agRows.push(node.data) })
    return agDataToRows(agRows, columns)
  }, [columns, rows])

  const onCellValueChanged = useCallback(
    (_event: CellValueChangedEvent<RowData>) => {
      onChange({ columns, rows: getCurrentRows() })
    },
    [columns, getCurrentRows, onChange]
  )

  const onSelectionChanged = useCallback((e: SelectionChangedEvent<RowData>) => {
    setSelectedCount(e.api.getSelectedNodes().length)
  }, [])

  const addRow = useCallback(() => {
    const newRow = createEmptyRow(columns)
    onChange({ columns, rows: [...getCurrentRows(), newRow] })
  }, [columns, getCurrentRows, onChange])

  const addSampleRows = useCallback(() => {
    const samples = createSampleRows(columns)
    onChange({ columns, rows: [...getCurrentRows(), ...samples] })
  }, [columns, getCurrentRows, onChange])

  const deleteSelectedRows = useCallback(() => {
    const api = gridRef.current?.api
    if (!api) return
    const selected = api.getSelectedNodes().map((n) => n.data?._id)
    if (selected.length === 0) return
    const newRows = getCurrentRows().filter((r) => !selected.includes(r.id))
    onChange({ columns, rows: newRows })
    setSelectedCount(0)
  }, [columns, getCurrentRows, onChange])

  const addColumn = useCallback(() => {
    const newCol: CampaignDataColumn = {
      id: `col_${Date.now()}`,
      name: `컬럼 ${columns.length + 1}`,
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
      {/* 툴바 */}
      <DataTableToolbar
        rowCount={rows.length}
        columnCount={columns.length}
        selectedCount={selectedCount}
        onAddRow={addRow}
        onAddColumn={addColumn}
        onOpenColumnDrawer={() => setShowColumnDrawer(true)}
        onDeleteSelected={deleteSelectedRows}
      />

      {/* 본문 */}
      <div className="flex-1 overflow-hidden p-3">
        {columns.length === 0 ? (
          /* 컬럼 없음 상태 */
          <div className="flex flex-col items-center justify-center h-full gap-4 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <TableProperties size={18} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500">컬럼을 먼저 추가하세요</p>
              <p className="text-xs text-gray-400">
                컬럼 설정에서 테이블 구조를 만들어보세요.
              </p>
            </div>
            <button
              onClick={() => setShowColumnDrawer(true)}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 px-3 py-1.5 border border-blue-200 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              <Plus size={13} /> 컬럼 추가
            </button>
          </div>
        ) : rows.length === 0 ? (
          /* 행 없음 상태 */
          <DataTableEmptyState onAddRow={addRow} onAddSampleRows={addSampleRows} />
        ) : (
          /* AG Grid */
          <div className="ag-theme-quartz campaign-data-grid h-full w-full">
            <AgGridReact<RowData>
              ref={gridRef}
              rowData={agData}
              columnDefs={agColumns}
              onCellValueChanged={onCellValueChanged}
              onSelectionChanged={onSelectionChanged}
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

      {/* 컬럼 설정 Drawer */}
      <DataTableColumnDrawer
        open={showColumnDrawer}
        columns={columns}
        onClose={() => setShowColumnDrawer(false)}
        onUpdate={updateColumn}
        onDelete={deleteColumn}
        onAdd={addColumn}
      />
    </div>
  )
}
