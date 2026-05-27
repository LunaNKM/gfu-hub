'use client'

import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type FilterFn,
  type Header,
  type Table,
  type Row,
} from '@tanstack/react-table'
import {
  AlignLeft,
  Calendar,
  CheckSquare,
  ChevronDownCircle,
  CircleDollarSign,
  Hash,
  Link2,
  Percent,
  Plus,
  Star,
  TableProperties,
  Tags,
  Type,
} from 'lucide-react'
import {
  CampaignDataTableContent,
  CampaignDataColumn,
  CampaignDataRow,
  CampaignColumnType,
  CampaignColumnRole,
  CampaignCellValue,
} from '@/types'
import { normalizeCellValue } from './workspaceUtils'
import { getColor } from '@/lib/palette'
import { createEmptyRow, createSampleRows } from './dataTableTemplates'
import { DataTableToolbar } from './DataTableToolbar'
import { DataTableColumnDrawer } from './DataTableColumnDrawer'
import { DataTableEmptyState } from './DataTableEmptyState'
import { EditableCell, type NavigateDir } from './EditableCell'

// ── 상수 ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<CampaignColumnType, React.ReactNode> = {
  text:         <Type size={11} />,
  long_text:    <AlignLeft size={11} />,
  number:       <Hash size={11} />,
  currency:     <CircleDollarSign size={11} />,
  percent:      <Percent size={11} />,
  date:         <Calendar size={11} />,
  select:       <ChevronDownCircle size={11} />,
  multi_select: <Tags size={11} />,
  checkbox:     <CheckSquare size={11} />,
  url:          <Link2 size={11} />,
  rating:       <Star size={11} />,
}

const COLUMN_TYPES: { value: CampaignColumnType; label: string }[] = [
  { value: 'text',         label: '텍스트' },
  { value: 'long_text',    label: '긴 텍스트' },
  { value: 'number',       label: '숫자' },
  { value: 'currency',     label: '금액' },
  { value: 'percent',      label: '퍼센트' },
  { value: 'date',         label: '날짜' },
  { value: 'select',       label: '선택' },
  { value: 'multi_select', label: '다중 선택' },
  { value: 'checkbox',     label: '체크박스' },
  { value: 'url',          label: 'URL' },
  { value: 'rating',       label: '별점' },
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

// ── 행 좌측 accent 컬러 ──────────────────────────────────────────────────

function getRowAccentColor(row: CampaignDataRow, columns: CampaignDataColumn[]): string | null {
  // 우선순위 1: role='status'인 select/multi_select 컬럼
  const statusCol = columns.find(
    (c) => c.role === 'status' && (c.type === 'select' || c.type === 'multi_select')
  )
  if (statusCol) {
    const val = row.cells[statusCol.id]
    const strVal = Array.isArray(val) ? val[0] : (val ? String(val) : null)
    if (strVal) {
      const opt = statusCol.options?.find((o) => o.value === strVal)
      if (opt?.color) return getColor(opt.color).bg
    }
  }
  // 우선순위 2: 첫 번째 multi_select 컬럼의 첫 값
  const msCol = columns.find((c) => c.type === 'multi_select')
  if (msCol) {
    const val = row.cells[msCol.id]
    const firstVal = Array.isArray(val) ? val[0] : null
    if (firstVal) {
      const opt = msCol.options?.find((o) => o.value === firstVal)
      if (opt?.color) return getColor(opt.color).bg
    }
  }
  return null
}

function getColMinWidth(type: CampaignColumnType): number {
  switch (type) {
    case 'checkbox':     return 72
    case 'rating':       return 120
    case 'date':         return 130
    case 'currency':     return 130
    case 'number':
    case 'percent':      return 110
    case 'url':          return 200
    case 'long_text':    return 200
    case 'multi_select': return 180
    default:             return 150
  }
}

// ── 글로벌 필터 함수 ─────────────────────────────────────────────────────

const globalFilterFn: FilterFn<CampaignDataRow> = (row, columnId, filterValue: string) => {
  const value = row.getValue(columnId)
  if (value == null || value === '') return false
  return String(value).toLowerCase().includes(filterValue.toLowerCase())
}

// ── 헤더 전체선택 체크박스 ────────────────────────────────────────────────

function HeaderCheckbox({ table }: { table: Table<CampaignDataRow> }) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate =
        table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
    }
  })

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={table.getIsAllRowsSelected()}
      onChange={table.getToggleAllRowsSelectedHandler()}
      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer focus:ring-1 focus:ring-blue-400"
      aria-label="전체 선택"
    />
  )
}

// ── 컬럼 헤더 ─────────────────────────────────────────────────────────────

function TypedColumnHeader({
  col,
  header,
  onUpdate,
  onDelete,
}: {
  col: CampaignDataColumn
  header: Header<CampaignDataRow, unknown>
  onUpdate: (patch: Partial<CampaignDataColumn>) => void
  onDelete: () => void
}) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [nameInput, setNameInput] = useState(col.name)
  const [showMenu, setShowMenu] = useState(false)
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sortDir = header.column.getIsSorted()

  useEffect(() => { setNameInput(col.name) }, [col.name])

  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const commitRename = () => {
    const trimmed = nameInput.trim()
    if (trimmed && trimmed !== col.name) onUpdate({ name: trimmed })
    else setNameInput(col.name)
    setIsRenaming(false)
  }

  const handleClick = () => {
    if (clickTimerRef.current) return
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null
      header.column.toggleSorting()
    }, 230)
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    setIsRenaming(true)
    setNameInput(col.name)
  }

  return (
    <div className="flex items-center gap-1 w-full h-full overflow-hidden group/colhdr select-none">
      <span className="shrink-0 text-gray-400 flex items-center justify-center w-4" title={col.type}>
        {TYPE_ICON[col.type] ?? <Type size={11} />}
      </span>

      {isRenaming ? (
        <input
          autoFocus
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') { setNameInput(col.name); setIsRenaming(false) }
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 text-xs border border-blue-400 rounded px-1.5 py-0.5 outline-none bg-white shadow-sm"
        />
      ) : (
        <button
          className="flex-1 min-w-0 text-left text-xs font-medium text-gray-600 truncate hover:text-gray-800 leading-none"
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          title="클릭: 정렬 / 더블클릭: 이름 변경"
        >
          {col.name}
        </button>
      )}

      {sortDir && (
        <span className="shrink-0 text-gray-400 text-[10px] leading-none">
          {sortDir === 'asc' ? '↑' : '↓'}
        </span>
      )}

      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setMenuRect(e.currentTarget.getBoundingClientRect())
            setShowMenu((v) => !v)
          }}
          className="opacity-0 group-hover/colhdr:opacity-100 text-gray-400 hover:text-gray-700 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 transition-opacity text-sm leading-none"
          title="컬럼 옵션"
          aria-label={`${col.name} 컬럼 옵션`}
        >
          ⋯
        </button>

        {showMenu && menuRect && (
          <div
            className="fixed z-[1000] w-48 rounded-lg border border-gray-200 bg-white py-1.5 shadow-lg"
            style={{ left: Math.max(8, menuRect.right - 192), top: menuRect.bottom + 4 }}
          >
            <button
              onClick={() => { setIsRenaming(true); setNameInput(col.name); setShowMenu(false) }}
              className="w-full text-left text-xs text-gray-700 hover:bg-gray-50 px-3 py-1.5"
            >
              이름 변경
            </button>
            <div className="border-t border-gray-100 my-1" />
            <div className="px-3 py-1.5 space-y-1">
              <p className="text-[10px] text-gray-400">타입</p>
              <select
                value={col.type}
                onChange={(e) => { onUpdate({ type: e.target.value as CampaignColumnType }); setShowMenu(false) }}
                onClick={(e) => e.stopPropagation()}
                className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 bg-white outline-none text-gray-600 focus:border-blue-400"
              >
                {COLUMN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="px-3 py-1.5 space-y-1">
              <p className="text-[10px] text-gray-400">역할</p>
              <select
                value={col.role ?? ''}
                onChange={(e) => { onUpdate({ role: (e.target.value as CampaignColumnRole) || undefined }); setShowMenu(false) }}
                onClick={(e) => e.stopPropagation()}
                className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 bg-white outline-none text-gray-600 focus:border-blue-400"
              >
                {COLUMN_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={() => { if (confirm(`"${col.name}" 컬럼을 삭제할까요?`)) { onDelete(); setShowMenu(false) } }}
              className="w-full text-left text-xs text-red-500 hover:bg-red-50 px-3 py-1.5"
            >
              컬럼 삭제
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────

interface Props {
  content: CampaignDataTableContent
  onChange: (content: CampaignDataTableContent) => void
  compact?: boolean
}

export function DataTableSectionEditor({ content, onChange, compact = false }: Props) {
  const { columns, rows } = content
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [globalFilter, setGlobalFilter] = useState('')
  const [showColumnDrawer, setShowColumnDrawer] = useState(false)

  // table 인스턴스를 ref로 최신 유지 (navigateFrom에서 표시 순서 기반 이동)
  const tableRef = useRef<ReturnType<typeof useReactTable<CampaignDataRow>> | null>(null)
  // 테이블 DOM 컨테이너 (focusCell용)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const latestRef = useRef({ columns, rows, onChange })

  useLayoutEffect(() => {
    latestRef.current = { columns, rows, onChange }
  }, [columns, rows, onChange])

  // ── 셀 포커스 / 키보드 이동 ──────────────────────────────────────────

  const focusCell = useCallback((rowId: string, colId: string) => {
    const el = tableContainerRef.current?.querySelector(
      `[data-cell-row="${rowId}"][data-cell-col="${colId}"]`
    ) as HTMLElement | null
    el?.focus()
  }, [])

  const navigateFrom = useCallback(
    (rowId: string, colId: string, dir: NavigateDir) => {
      const latestColumns = latestRef.current.columns
      const displayRows = tableRef.current?.getRowModel().rows ?? []
      const rowIdx = displayRows.findIndex((r) => r.original.id === rowId)
      const colIdx = latestColumns.findIndex((c) => c.id === colId)

      let targetRowIdx = rowIdx
      let targetColIdx = colIdx

      switch (dir) {
        case 'up':    targetRowIdx--; break
        case 'down':  targetRowIdx++; break
        case 'left':  targetColIdx--; break
        case 'right': targetColIdx++; break
        case 'tab':
          targetColIdx++
          if (targetColIdx >= latestColumns.length) {
            targetColIdx = 0
            targetRowIdx++
          }
          break
      }

      if (targetRowIdx < 0 || targetRowIdx >= displayRows.length) return
      if (targetColIdx < 0 || targetColIdx >= latestColumns.length) return

      const targetRow = displayRows[targetRowIdx]?.original
      const targetCol = latestColumns[targetColIdx]
      if (targetRow && targetCol) focusCell(targetRow.id, targetCol.id)
    },
    [focusCell]
  )

  // ── TSV Paste 처리 ───────────────────────────────────────────────────

  const handlePaste = useCallback(
    (text: string, startRowId: string, startColId: string) => {
      const tsvRows = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim()
        .split('\n')
        .map((line) => line.split('\t'))

      const { columns: latestColumns, rows: latestRows, onChange: latestOnChange } = latestRef.current
      const startRowIdx = latestRows.findIndex((r) => r.id === startRowId)
      const startColIdx = latestColumns.findIndex((c) => c.id === startColId)
      if (startRowIdx === -1 || startColIdx === -1) return

      const newRows = [...latestRows]

      for (let r = 0; r < tsvRows.length; r++) {
        const targetRowIdx = startRowIdx + r

        // 행이 부족하면 새 행 추가
        if (targetRowIdx >= newRows.length) {
          newRows.push(createEmptyRow(latestColumns))
        }

        const cells = { ...newRows[targetRowIdx].cells }
        const tsvCells = tsvRows[r]

        for (let c = 0; c < tsvCells.length; c++) {
          const targetColIdx = startColIdx + c
          if (targetColIdx >= latestColumns.length) break
          const col = latestColumns[targetColIdx]
          cells[col.id] = normalizeCellValue(tsvCells[c].trim(), col.type) as
            | string
            | number
            | boolean
            | null
        }

        newRows[targetRowIdx] = { ...newRows[targetRowIdx], cells }
      }

      latestOnChange({ columns: latestColumns, rows: newRows })
    },
    []
  )

  // ── 컬럼 / 행 콜백 ───────────────────────────────────────────────────

  const updateCell = useCallback(
    (rowId: string, colId: string, value: CampaignCellValue) => {
      const { columns: latestColumns, rows: latestRows, onChange: latestOnChange } = latestRef.current
      const newRows = latestRows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r
      )
      latestOnChange({ columns: latestColumns, rows: newRows })
    },
    []
  )

  const updateColumn = useCallback(
    (colId: string, patch: Partial<CampaignDataColumn>) => {
      onChange({ columns: columns.map((c) => (c.id === colId ? { ...c, ...patch } : c)), rows })
    },
    [columns, rows, onChange]
  )

  const deleteColumn = useCallback(
    (colId: string) => {
      const newColumns = columns.filter((c) => c.id !== colId)
      const newRows = rows.map((r) => {
        const cells = { ...r.cells }
        delete cells[colId]
        return { ...r, cells }
      })
      onChange({ columns: newColumns, rows: newRows })
    },
    [columns, rows, onChange]
  )

  const reorderColumns = useCallback(
    (newColumns: CampaignDataColumn[]) => {
      onChange({ columns: newColumns, rows })
    },
    [rows, onChange]
  )

  const addRow = useCallback(() => {
    onChange({ columns, rows: [...rows, createEmptyRow(columns)] })
  }, [columns, rows, onChange])

  const addSampleRows = useCallback(() => {
    onChange({ columns, rows: [...rows, ...createSampleRows(columns)] })
  }, [columns, rows, onChange])

  const deleteSelectedRows = useCallback(() => {
    const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id])
    if (selectedIds.length === 0) return
    if (!confirm(`선택한 ${selectedIds.length}개 행을 삭제할까요?`)) return
    onChange({ columns, rows: rows.filter((r) => !selectedIds.includes(r.id)) })
    setRowSelection({})
  }, [rowSelection, columns, rows, onChange])

  const addColumn = useCallback(() => {
    const newCol: CampaignDataColumn = { id: `col_${Date.now()}`, name: '새 컬럼', type: 'text' }
    const newColumns = [...columns, newCol]
    const newRows = rows.map((r) => ({ ...r, cells: { ...r.cells, [newCol.id]: null } }))
    onChange({ columns: newColumns, rows: newRows })
  }, [columns, rows, onChange])

  // ── TanStack 컬럼 정의 ───────────────────────────────────────────────

  const tableColumns = useMemo<ColumnDef<CampaignDataRow>[]>(
    () => [
      {
        id: '_accent',
        header: () => null,
        cell: ({ row }: { row: Row<CampaignDataRow> }) => {
          const color = getRowAccentColor(row.original, latestRef.current.columns)
          return (
            <div
              style={{ width: 4, height: 40, background: color ?? 'transparent', flexShrink: 0 }}
            />
          )
        },
        size: 4,
        minSize: 4,
        enableSorting: false,
      } as ColumnDef<CampaignDataRow>,
      {
        id: '_select',
        header: ({ table }: { table: Table<CampaignDataRow> }) => <HeaderCheckbox table={table} />,
        cell: ({ row }: { row: Row<CampaignDataRow> }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer focus:ring-1 focus:ring-blue-400"
            aria-label="행 선택"
          />
        ),
        size: 44,
        enableSorting: false,
      } as ColumnDef<CampaignDataRow>,

      ...columns.map(
        (col): ColumnDef<CampaignDataRow> => ({
          id: col.id,
          accessorFn: (row: CampaignDataRow) => row.cells[col.id] ?? null,
          header: ({ header }) => (
            <TypedColumnHeader
              col={col}
              header={header as Header<CampaignDataRow, unknown>}
              onUpdate={(patch) => updateColumn(col.id, patch)}
              onDelete={() => deleteColumn(col.id)}
            />
          ),
          cell: ({ row, getValue }) => (
            <EditableCell
              value={getValue() as CampaignCellValue}
              column={col}
              rowId={row.original.id}
              colId={col.id}
              onChange={(value) => updateCell(row.original.id, col.id, value)}
              onNavigate={(dir) => navigateFrom(row.original.id, col.id, dir)}
              onPaste={(text) => handlePaste(text, row.original.id, col.id)}
            />
          ),
          minSize: getColMinWidth(col.type),
          size: getColMinWidth(col.type),
          enableSorting: col.type !== 'checkbox',
        })
      ),
    ],
    [columns, updateColumn, deleteColumn, updateCell, navigateFrom, handlePaste]
  )

  // ── TanStack 인스턴스 ─────────────────────────────────────────────────

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: { sorting, rowSelection, globalFilter },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.id,
    enableRowSelection: true,
  })

  // table 인스턴스를 ref에 항상 최신화
  useLayoutEffect(() => { tableRef.current = table })

  const selectedCount = Object.values(rowSelection).filter(Boolean).length
  const filteredRowCount = table.getRowModel().rows.length

  // ── 렌더 ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-white">
      {/* 툴바 */}
      {!compact && (
        <DataTableToolbar
          rowCount={rows.length}
          filteredRowCount={filteredRowCount}
          columnCount={columns.length}
          selectedCount={selectedCount}
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
          onAddRow={addRow}
          onAddColumn={addColumn}
          onOpenColumnDrawer={() => setShowColumnDrawer(true)}
          onDeleteSelected={deleteSelectedRows}
        />
      )}

      {/* 본문 */}
      <div className={compact ? 'flex-1 overflow-hidden bg-white' : 'flex-1 overflow-hidden bg-white p-3'}>
        {columns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <TableProperties size={18} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500">컬럼을 먼저 추가하세요</p>
              <p className="text-xs text-gray-400">컬럼 설정에서 테이블 구조를 만들어보세요.</p>
            </div>
            <button
              onClick={() => setShowColumnDrawer(true)}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 px-3 py-1.5 border border-blue-200 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              <Plus size={13} /> 컬럼 추가
            </button>
          </div>
        ) : rows.length === 0 ? (
          <DataTableEmptyState onAddRow={addRow} onAddSampleRows={addSampleRows} />
        ) : (
          /* ── 테이블 ── */
          <div
            ref={tableContainerRef}
            className={compact ? 'h-full overflow-auto bg-white' : 'h-full overflow-auto rounded-lg bg-white'}
            style={{ border: compact ? 'none' : '1px solid #e9e9e7' }}
          >
            <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', tableLayout: 'auto', background: '#ffffff' }}>
              <thead style={{ background: '#f7f7f5', position: 'sticky', top: 0, zIndex: 10 }}>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header, i) => {
                      const isAccent = header.id === '_accent'
                      const isSelect = header.id === '_select'
                      return (
                        <th
                          key={header.id}
                          style={{
                            minWidth: isAccent ? 4 : isSelect ? 44 : getColMinWidth(
                              columns.find((c) => c.id === header.id)?.type ?? 'text'
                            ),
                            width: isAccent ? 4 : isSelect ? 44 : undefined,
                            height: 36,
                            padding: isAccent ? '0' : isSelect ? '0' : '0 12px',
                            textAlign: 'left',
                            borderBottom: '1px solid #e9e9e7',
                            borderRight: !isAccent && i < hg.headers.length - 1 ? '1px solid #e9e9e7' : 'none',
                            verticalAlign: 'middle',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isAccent ? null : isSelect ? (
                            <div className="flex items-center justify-center h-full">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </div>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </th>
                      )
                    })}
                  </tr>
                ))}
              </thead>

              <tbody>
                {table.getRowModel().rows.map((row, rowIdx) => (
                  <tr
                    key={row.id}
                    style={{ background: row.getIsSelected() ? '#f4f8ff' : '#ffffff' }}
                    className="transition-colors duration-75 hover:bg-[#f7f7f5]"
                  >
                    {row.getVisibleCells().map((cell, cellIdx) => {
                      const isAccent = cell.column.id === '_accent'
                      const isSelect = cell.column.id === '_select'
                      return (
                        <td
                          key={cell.id}
                          style={{
                            height: 40,
                            padding: isAccent ? '0' : isSelect ? '0' : '0 12px',
                            borderBottom:
                              rowIdx < table.getRowModel().rows.length - 1
                                ? '1px solid #e9e9e7'
                                : 'none',
                            borderRight:
                              !isAccent && cellIdx < row.getVisibleCells().length - 1
                                ? '1px solid #e9e9e7'
                                : 'none',
                            verticalAlign: 'middle',
                            overflow: 'hidden',
                            minWidth: isAccent ? 4 : isSelect ? 44 : getColMinWidth(
                              columns.find((c) => c.id === cell.column.id)?.type ?? 'text'
                            ),
                            width: isAccent ? 4 : isSelect ? 44 : undefined,
                          }}
                        >
                          {isAccent ? (
                            flexRender(cell.column.columnDef.cell, cell.getContext())
                          ) : isSelect ? (
                            <div className="flex items-center justify-center h-full">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </div>
                          ) : (
                            flexRender(cell.column.columnDef.cell, cell.getContext())
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 하단 행 추가 버튼 */}
            <div
              className="border-t border-gray-100 bg-white flex items-center sticky bottom-0"
              style={{ height: 36, paddingLeft: 56 }}
            >
              <button
                onClick={addRow}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                title="행 추가"
              >
                <Plus size={12} /> 행 추가
              </button>
            </div>
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
        onReorder={reorderColumns}
      />
    </div>
  )
}
