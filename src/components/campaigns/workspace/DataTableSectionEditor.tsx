'use client'

import React, { useState, useCallback, useMemo, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import './workspace.css'
import {
  ModuleRegistry,
  AllCommunityModule,
  ColDef,
  GridReadyEvent,
  CellValueChangedEvent,
  SelectionChangedEvent,
} from 'ag-grid-community'
import {
  Plus, Trash2, ChevronDown, SlidersHorizontal,
  Type, Hash, CircleDollarSign, Percent, Calendar,
  List, CheckSquare, Link, TableProperties,
} from 'lucide-react'
import { clsx } from 'clsx'
import {
  CampaignDataTableContent,
  CampaignDataColumn,
  CampaignDataRow,
  CampaignColumnType,
  CampaignColumnRole,
} from '@/types'
import { normalizeCellValue, tagColor } from './workspaceUtils'

ModuleRegistry.registerModules([AllCommunityModule])

// ── 컬럼 타입 메타 ───────────────────────────────────────────────

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

// ── AG Grid 커스텀 헤더 컴포넌트 ──────────────────────────────────

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

// ── AG Grid 태그 셀 렌더러 ────────────────────────────────────────

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
  const [showColPanel, setShowColPanel] = useState(false)
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

  const onGridReady = useCallback((_params: GridReadyEvent) => {}, [])

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

  // ── 툴바 버튼 공통 스타일 ────────────────────────────────────
  const ghostBtn = 'flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-50 transition-colors'
  const primaryBtn = 'flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 px-2.5 py-1.5 border border-blue-200 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors'

  return (
    <div className="flex flex-col h-full">

      {/* ── 툴바 ── */}
      <div className="border-b border-gray-100 bg-white shrink-0 px-3 py-2 flex items-center gap-2">
        {/* 컬럼 관리 토글 */}
        <button
          onClick={() => setShowColPanel((v) => !v)}
          className={clsx(
            ghostBtn,
            showColPanel && 'bg-gray-100 text-gray-700 border-gray-300'
          )}
        >
          <SlidersHorizontal size={12} />
          컬럼 관리
          <ChevronDown
            size={11}
            className={clsx('transition-transform', showColPanel && 'rotate-180')}
          />
        </button>

        <button onClick={addColumn} className={ghostBtn}>
          <Plus size={12} /> 컬럼 추가
        </button>

        <button onClick={addRow} className={primaryBtn}>
          <Plus size={12} /> 행 추가
        </button>

        <button
          onClick={deleteSelectedRows}
          disabled={selectedCount === 0}
          className={clsx(
            'flex items-center gap-1.5 text-xs px-2.5 py-1.5 border rounded-md transition-colors',
            selectedCount > 0
              ? 'text-red-500 hover:text-red-700 border-red-200 bg-red-50 hover:bg-red-100'
              : 'text-gray-300 border-gray-100 bg-white cursor-default'
          )}
        >
          <Trash2 size={12} />
          {selectedCount > 0 ? `${selectedCount}행 삭제` : '행 삭제'}
        </button>

        {/* 우측: 행 개수 */}
        <div className="ml-auto text-xs text-gray-400">
          {rows.length > 0 && `${rows.length}개 행`}
        </div>
      </div>

      {/* ── 컬럼 관리 패널 ── */}
      {showColPanel && columns.length > 0 && (
        <div className="border-b border-gray-100 bg-gray-50 px-3 py-2.5 overflow-x-auto shrink-0">
          <div className="flex gap-2.5 min-w-max">
            {columns.map((col) => (
              <div
                key={col.id}
                className="bg-white border border-gray-200 rounded-lg p-2.5 min-w-44 shadow-sm"
              >
                <input
                  value={col.name}
                  onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                  className="w-full text-xs font-medium text-gray-800 border-b border-gray-100 pb-1.5 mb-2 outline-none focus:border-blue-400 bg-transparent"
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  <select
                    value={col.type}
                    onChange={(e) =>
                      updateColumn(col.id, { type: e.target.value as CampaignColumnType })
                    }
                    className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white outline-none text-gray-600 focus:border-blue-400"
                  >
                    {COLUMN_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={col.role ?? ''}
                    onChange={(e) =>
                      updateColumn(col.id, {
                        role: (e.target.value as CampaignColumnRole) || undefined,
                      })
                    }
                    className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white outline-none text-gray-600 focus:border-blue-400"
                  >
                    {COLUMN_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => deleteColumn(col.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors p-0.5"
                    title="컬럼 삭제"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── AG Grid / 빈 상태 ── */}
      <div className="flex-1 ag-theme-quartz gfu-grid overflow-hidden m-3">
        {columns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <TableProperties size={18} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500">아직 데이터가 없어요</p>
              <p className="text-xs text-gray-400">컬럼을 추가해서 테이블을 시작하세요</p>
            </div>
            <button onClick={addColumn} className={primaryBtn}>
              <Plus size={13} /> 컬럼 추가
            </button>
          </div>
        ) : (
          <div style={{ height: '100%', width: '100%' }}>
            <AgGridReact<RowData>
              ref={gridRef}
              rowData={agData}
              columnDefs={agColumns}
              onGridReady={onGridReady}
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
    </div>
  )
}
