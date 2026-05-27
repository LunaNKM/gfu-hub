'use client'

/* eslint-disable @next/next/no-img-element */
import React, { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Database,
  File,
  Heading2,
  Image as ImageIcon,
  ListPlus,
  Table2,
  Trash2,
  Type,
} from 'lucide-react'
import {
  CampaignBlock,
  CampaignBlockType,
  CampaignDataColumn,
  CampaignDataRow,
  CampaignDatabase,
  CampaignOverviewChart,
  CampaignSection,
} from '@/types'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

interface Props {
  section: CampaignSection
  blocks: CampaignBlock[]
  databases: CampaignDatabase[]
  campaignId: string
  onBlockUpdate: (blockId: string, content: Record<string, unknown>) => void
  onBlockPatch: (blockId: string, patch: Partial<CampaignBlock>) => void
  onBlockAdd: (
    sectionId: string,
    type: CampaignBlockType,
    content?: Record<string, unknown>
  ) => void
  onBlockDelete: (blockId: string) => void
  onBlockMove: (sectionId: string, blockId: string, direction: 'up' | 'down') => void
}

function numericValue(row: CampaignDataRow, colId: string): number {
  const value = row.cells[colId]
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function findColumn(
  columns: CampaignDataColumn[],
  names: string[],
  role?: CampaignDataColumn['role']
) {
  return (
    columns.find((column) => role && column.role === role) ??
    columns.find((column) => names.includes(column.id) || names.includes(column.name))
  )
}

function groupBy(rows: CampaignDataRow[], column: CampaignDataColumn) {
  const groups: Record<string, number> = {}
  for (const row of rows) {
    const name = String(row.cells[column.id] ?? '미입력')
    groups[name] = (groups[name] ?? 0) + 1
  }
  return Object.entries(groups)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

function ranking(rows: CampaignDataRow[], nameColumn: CampaignDataColumn, metricColumn: CampaignDataColumn) {
  return [...rows]
    .map((row) => ({
      name: String(row.cells[nameColumn.id] ?? '미입력'),
      value: numericValue(row, metricColumn.id),
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
}

function buildChartOptions(database: CampaignDatabase): CampaignOverviewChart[] {
  const { columns, rows, businessType } = database
  if (rows.length === 0) return []

  const options: CampaignOverviewChart[] = []
  const platform = findColumn(columns, ['플랫폼', 'platform'], 'platform')
  const category = findColumn(columns, ['카테고리', 'category'], 'dimension')
  const status = findColumn(columns, ['현재 상태', '상태', 'status'], 'status')
  const name = findColumn(columns, ['계정명', '인플루언서', 'name'], 'dimension')
  const views = findColumn(columns, ['조회수', 'views'], 'performance')
  const er = findColumn(columns, ['ER', 'er'], 'metric')

  if (status) {
    options.push({
      id: `${database.id}:status`,
      title: '상태별 진행 현황',
      type: 'bar',
      data: groupBy(rows, status),
    })
  }
  if (platform) {
    options.push({
      id: `${database.id}:platform`,
      title: businessType === 'confirmed_influencers' ? '플랫폼별 확정 인원 수' : '플랫폼 비율',
      type: 'pie',
      data: groupBy(rows, platform),
    })
  }
  if (category) {
    options.push({
      id: `${database.id}:category`,
      title: '카테고리 비율',
      type: 'pie',
      data: groupBy(rows, category),
    })
  }
  if (name && views) {
    options.push({
      id: `${database.id}:top_views`,
      title: '조회수 상위 인플루언서',
      type: 'ranking',
      data: ranking(rows, name, views),
    })
  }
  if (name && er) {
    options.push({
      id: `${database.id}:top_er`,
      title: 'ER 상위 인플루언서',
      type: 'ranking',
      data: ranking(rows, name, er),
    })
  }

  return options.filter((option) => option.data.length > 0)
}

function ChartPreview({ chart }: { chart: CampaignOverviewChart }) {
  if (chart.type === 'ranking') {
    const max = chart.data[0]?.value ?? 1
    return (
      <div className="space-y-2">
        {chart.data.slice(0, 8).map((item, index) => (
          <div key={`${item.name}-${index}`} className="flex items-center gap-2 text-xs">
            <span className="w-4 text-right text-gray-400">{index + 1}</span>
            <span className="flex-1 truncate text-gray-700">{item.name}</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${max > 0 ? (item.value / max) * 100 : 0}%` }}
              />
            </div>
            <span className="w-14 text-right text-gray-500">{item.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    )
  }

  if (chart.type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={chart.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={64}>
            {chart.data.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={chart.data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {chart.data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function BlockFrame({
  block,
  sectionId,
  children,
  onPatch,
  onDelete,
  onMove,
}: {
  block: CampaignBlock
  sectionId: string
  children: React.ReactNode
  onPatch: (patch: Partial<CampaignBlock>) => void
  onDelete: () => void
  onMove: (direction: 'up' | 'down') => void
}) {
  return (
    <div className="group relative rounded-md border border-transparent px-2 py-1 hover:border-gray-100 hover:bg-gray-50/60">
      <div className="absolute -left-28 top-1 hidden items-center gap-1 group-hover:flex">
        <button
          type="button"
          onClick={() => onMove('up')}
          className="rounded border border-gray-200 bg-white p-1 text-gray-400 hover:text-gray-700"
          title="위로 이동"
        >
          <ArrowUp size={12} />
        </button>
        <button
          type="button"
          onClick={() => onMove('down')}
          className="rounded border border-gray-200 bg-white p-1 text-gray-400 hover:text-gray-700"
          title="아래로 이동"
        >
          <ArrowDown size={12} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded border border-gray-200 bg-white p-1 text-gray-400 hover:text-red-500"
          title="삭제"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="absolute right-2 top-1 hidden items-center gap-2 group-hover:flex">
        <label className="flex items-center gap-1 text-[11px] text-gray-400">
          <input
            type="checkbox"
            checked={block.clientVisible}
            onChange={(event) => onPatch({ clientVisible: event.target.checked })}
            className="h-3 w-3"
          />
          고객 공개
        </label>
        <label className="flex items-center gap-1 text-[11px] text-gray-400">
          <input
            type="checkbox"
            checked={block.clientEditable}
            onChange={(event) => onPatch({ clientEditable: event.target.checked })}
            className="h-3 w-3"
          />
          고객 수정
        </label>
      </div>
      <div data-section-id={sectionId}>{children}</div>
    </div>
  )
}

function TextBlock({
  block,
  type,
  onUpdate,
}: {
  block: CampaignBlock
  type: 'heading' | 'paragraph'
  onUpdate: (content: Record<string, unknown>) => void
}) {
  const [draft, setDraft] = useState(String(block.content.text ?? ''))

  const commit = () => {
    onUpdate({ ...block.content, text: draft })
  }

  if (type === 'heading') {
    return (
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        placeholder="제목을 입력하세요"
        className="w-full bg-transparent py-1 text-xl font-bold text-gray-900 outline-none placeholder:text-gray-300"
      />
    )
  }

  return (
    <textarea
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      placeholder="내용을 입력하세요"
      rows={Math.max(3, draft.split('\n').length)}
      className="w-full resize-none bg-transparent py-1 text-sm leading-7 text-gray-700 outline-none placeholder:text-gray-300"
    />
  )
}

function ImageBlock({
  block,
  onUpdate,
}: {
  block: CampaignBlock
  onUpdate: (content: Record<string, unknown>) => void
}) {
  const url = String(block.content.url ?? '')
  const caption = String(block.content.caption ?? '')
  return (
    <div className="space-y-2">
      <input
        value={url}
        onChange={(event) => onUpdate({ ...block.content, url: event.target.value })}
        placeholder="이미지 URL"
        className="w-full rounded border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
      />
      {url && <img src={url} alt={caption || '첨부 이미지'} className="max-h-80 rounded border border-gray-100" />}
      <input
        value={caption}
        onChange={(event) => onUpdate({ ...block.content, caption: event.target.value })}
        placeholder="캡션"
        className="w-full bg-transparent text-xs text-gray-500 outline-none placeholder:text-gray-300"
      />
    </div>
  )
}

function FileBlock({
  block,
  onUpdate,
}: {
  block: CampaignBlock
  onUpdate: (content: Record<string, unknown>) => void
}) {
  const name = String(block.content.name ?? '')
  const url = String(block.content.url ?? '')
  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
        <File size={14} className="text-gray-400" />
        첨부파일
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={name}
          onChange={(event) => onUpdate({ ...block.content, name: event.target.value })}
          placeholder="파일명"
          className="rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400"
        />
        <input
          value={url}
          onChange={(event) => onUpdate({ ...block.content, url: event.target.value })}
          placeholder="파일 URL"
          className="rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400"
        />
      </div>
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-blue-600">
          {name || '파일 열기'}
        </a>
      )}
    </div>
  )
}

function SimpleTableBlock({
  block,
  onUpdate,
}: {
  block: CampaignBlock
  onUpdate: (content: Record<string, unknown>) => void
}) {
  const rows = (block.content.rows as string[][] | undefined) ?? [['', '', ''], ['', '', ''], ['', '', '']]
  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    const next = rows.map((row) => [...row])
    next[rowIndex][colIndex] = value
    onUpdate({ ...block.content, rows: next })
  }
  return (
    <table className="w-full overflow-hidden rounded border border-gray-200 text-sm">
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="border-b border-gray-100 last:border-b-0">
            {row.map((cell, colIndex) => (
              <td key={colIndex} className="border-r border-gray-100 last:border-r-0">
                <input
                  value={cell}
                  onChange={(event) => updateCell(rowIndex, colIndex, event.target.value)}
                  className="w-full px-2 py-1.5 outline-none focus:bg-blue-50"
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DatabaseEmbedBlock({
  block,
  databases,
  onUpdate,
}: {
  block: CampaignBlock
  databases: CampaignDatabase[]
  onUpdate: (content: Record<string, unknown>) => void
}) {
  const databaseId = String(block.content.databaseId ?? '')
  const db = databases.find((database) => database.id === databaseId)

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2">
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
          {databases.map((database) => (
            <option key={database.id} value={database.id}>
              {database.title}
            </option>
          ))}
        </select>
      </div>
      {!db ? (
        <div className="p-5 text-center text-xs text-gray-400">삽입할 데이터베이스를 선택하세요.</div>
      ) : (
        <>
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-sm font-semibold text-gray-800">{db.title}</p>
            <p className="text-xs text-gray-400">
              {db.rows.length}개 행 · {db.columns.length}개 컬럼
            </p>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                {db.columns.slice(0, 5).map((column) => (
                  <th key={column.id} className="border-t border-r border-gray-100 px-3 py-2 text-left font-medium text-gray-500 last:border-r-0">
                    {column.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {db.rows.slice(0, 4).map((row) => (
                <tr key={row.id}>
                  {db.columns.slice(0, 5).map((column) => (
                    <td key={column.id} className="border-t border-r border-gray-100 px-3 py-2 text-gray-700 last:border-r-0">
                      {String(row.cells[column.id] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {db.rows.length === 0 && <div className="border-t border-gray-100 p-4 text-xs text-gray-400">아직 데이터가 없습니다.</div>}
        </>
      )}
    </div>
  )
}

function ChartEmbedBlock({
  block,
  databases,
  onUpdate,
}: {
  block: CampaignBlock
  databases: CampaignDatabase[]
  onUpdate: (content: Record<string, unknown>) => void
}) {
  const databaseId = String(block.content.databaseId ?? '')
  const db = databases.find((database) => database.id === databaseId)
  const options = db ? buildChartOptions(db) : []
  const chartId = String(block.content.chartId ?? '')
  const chart = options.find((option) => option.id === chartId) ?? options[0]

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
          <BarChart3 size={13} className="text-gray-400" />
          추천 차트
        </div>
        <select
          value={databaseId}
          onChange={(event) => onUpdate({ databaseId: event.target.value, chartId: '' })}
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs outline-none"
        >
          <option value="">데이터베이스 선택</option>
          {databases.map((database) => (
            <option key={database.id} value={database.id}>
              {database.title}
            </option>
          ))}
        </select>
        {db && (
          <select
            value={chart?.id ?? ''}
            onChange={(event) => onUpdate({ ...block.content, databaseId, chartId: event.target.value })}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs outline-none"
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        )}
      </div>
      {!db ? (
        <div className="p-5 text-center text-xs text-gray-400">차트를 만들 데이터베이스를 선택하세요.</div>
      ) : !chart ? (
        <div className="p-5 text-center text-xs text-gray-400">추천 가능한 차트가 없습니다. 데이터를 먼저 입력하세요.</div>
      ) : (
        <>
          <p className="mb-3 text-sm font-semibold text-gray-800">{chart.title}</p>
          <ChartPreview chart={chart} />
        </>
      )}
    </div>
  )
}

function defaultBlockContent(type: CampaignBlockType, databases: CampaignDatabase[]): Record<string, unknown> {
  const firstDb = databases[0]
  if (type === 'heading') return { text: '' }
  if (type === 'paragraph') return { text: '' }
  if (type === 'database_embed') return { databaseId: firstDb?.id ?? '' }
  if (type === 'chart_embed') return { databaseId: firstDb?.id ?? '', chartId: '' }
  if (type === 'simple_table') return { rows: [['', '', ''], ['', '', ''], ['', '', '']] }
  if (type === 'image') return { url: '', caption: '' }
  if (type === 'file') return { name: '', url: '' }
  return {}
}

function AddBlockBar({
  sectionId,
  databases,
  onAdd,
}: {
  sectionId: string
  databases: CampaignDatabase[]
  onAdd: (sectionId: string, type: CampaignBlockType, content?: Record<string, unknown>) => void
}) {
  const buttons: { type: CampaignBlockType; label: string; icon: React.ReactNode }[] = [
    { type: 'heading', label: '제목', icon: <Heading2 size={13} /> },
    { type: 'paragraph', label: '텍스트', icon: <Type size={13} /> },
    { type: 'database_embed', label: 'DB 삽입', icon: <Database size={13} /> },
    { type: 'chart_embed', label: '차트 삽입', icon: <BarChart3 size={13} /> },
    { type: 'simple_table', label: '간단 표', icon: <Table2 size={13} /> },
    { type: 'image', label: '이미지', icon: <ImageIcon size={13} /> },
    { type: 'file', label: '파일', icon: <File size={13} /> },
  ]

  return (
    <div className="mt-6 flex flex-wrap gap-1.5 border-t border-gray-100 pt-4">
      {buttons.map((button) => (
        <button
          key={button.type}
          type="button"
          onClick={() => onAdd(sectionId, button.type, defaultBlockContent(button.type, databases))}
          className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          {button.icon}
          {button.label}
        </button>
      ))}
    </div>
  )
}

export function CampaignSectionDocument({
  section,
  blocks,
  databases,
  onBlockUpdate,
  onBlockPatch,
  onBlockAdd,
  onBlockDelete,
  onBlockMove,
}: Props) {
  const sectionBlocks = useMemo(
    () =>
      blocks
        .filter((block) => block.sectionId === section.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [blocks, section.id]
  )

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="mx-auto max-w-4xl px-10 py-10">
        <div className="mb-8 border-b border-gray-100 pb-5">
          <p className="mb-1 text-xs font-medium text-gray-400">문서 섹션</p>
          <h1 className="text-2xl font-bold text-gray-900">{section.title}</h1>
        </div>

        <div className="space-y-3">
          {sectionBlocks.map((block) => {
            const common = {
              block,
              sectionId: section.id,
              onPatch: (patch: Partial<CampaignBlock>) => onBlockPatch(block.id, patch),
              onDelete: () => {
                if (confirm('이 블록을 삭제할까요?')) onBlockDelete(block.id)
              },
              onMove: (direction: 'up' | 'down') => onBlockMove(section.id, block.id, direction),
            }

            let body: React.ReactNode = null
            if (block.type === 'heading' || block.type === 'paragraph') {
              body = (
                <TextBlock
                  block={block}
                  type={block.type}
                  onUpdate={(content) => onBlockUpdate(block.id, content)}
                />
              )
            } else if (block.type === 'database_embed') {
              body = (
                <DatabaseEmbedBlock
                  block={block}
                  databases={databases}
                  onUpdate={(content) => onBlockUpdate(block.id, content)}
                />
              )
            } else if (block.type === 'chart_embed') {
              body = (
                <ChartEmbedBlock
                  block={block}
                  databases={databases}
                  onUpdate={(content) => onBlockUpdate(block.id, content)}
                />
              )
            } else if (block.type === 'simple_table') {
              body = <SimpleTableBlock block={block} onUpdate={(content) => onBlockUpdate(block.id, content)} />
            } else if (block.type === 'image') {
              body = <ImageBlock block={block} onUpdate={(content) => onBlockUpdate(block.id, content)} />
            } else if (block.type === 'file') {
              body = <FileBlock block={block} onUpdate={(content) => onBlockUpdate(block.id, content)} />
            }

            return <BlockFrame key={block.id} {...common}>{body}</BlockFrame>
          })}

          {sectionBlocks.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center">
              <ListPlus size={22} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">아직 문서 블록이 없습니다</p>
              <p className="mt-1 text-xs text-gray-400">텍스트, 데이터베이스, 차트를 추가해 시작하세요.</p>
            </div>
          )}
        </div>

        <AddBlockBar sectionId={section.id} databases={databases} onAdd={onBlockAdd} />
      </div>
    </div>
  )
}
