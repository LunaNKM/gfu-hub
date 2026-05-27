'use client'

import React, { useState } from 'react'
import { CampaignSection, CampaignBlock, CampaignDatabase } from '@/types'

// ── 블록 렌더러 ───────────────────────────────────────────────────

function HeadingBlock({
  block,
  onUpdate,
}: {
  block: CampaignBlock
  onUpdate: (content: Record<string, unknown>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState((block.content.text as string) ?? '')

  const commit = () => {
    onUpdate({ text: draft })
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft((block.content.text as string) ?? ''); setEditing(false) }
        }}
        className="text-xl font-bold text-gray-900 bg-transparent border-b border-blue-400 outline-none w-full py-1"
      />
    )
  }

  return (
    <h2
      className="text-xl font-bold text-gray-900 py-1 cursor-text hover:bg-gray-50 rounded px-1 -mx-1"
      onClick={() => setEditing(true)}
    >
      {(block.content.text as string) || <span className="text-gray-300">제목 입력...</span>}
    </h2>
  )
}

function ParagraphBlock({
  block,
  onUpdate,
}: {
  block: CampaignBlock
  onUpdate: (content: Record<string, unknown>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState((block.content.text as string) ?? '')

  const commit = () => {
    onUpdate({ text: draft })
    setEditing(false)
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setDraft((block.content.text as string) ?? ''); setEditing(false) }
        }}
        rows={4}
        className="w-full text-sm text-gray-800 bg-transparent border border-blue-200 rounded px-2 py-1.5 outline-none resize-none focus:border-blue-400"
        placeholder="내용을 입력하세요..."
      />
    )
  }

  return (
    <p
      className="text-sm text-gray-700 leading-relaxed py-1 cursor-text hover:bg-gray-50 rounded px-1 -mx-1 whitespace-pre-wrap"
      onClick={() => setEditing(true)}
    >
      {(block.content.text as string) || (
        <span className="text-gray-300">클릭하여 내용 입력...</span>
      )}
    </p>
  )
}

function DatabaseEmbedBlock({
  block,
  databases,
}: {
  block: CampaignBlock
  databases: CampaignDatabase[]
}) {
  const databaseId = block.content.databaseId as string | undefined
  const db = databases.find((d) => d.id === databaseId)

  if (!db) {
    return (
      <div className="border border-dashed border-gray-200 rounded-lg p-4 text-xs text-gray-400 text-center">
        연결된 데이터베이스가 없습니다
      </div>
    )
  }

  const previewRows = db.rows.slice(0, 3)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <span className="text-xs font-medium text-gray-600">{db.title}</span>
        <span className="text-xs text-gray-400">({db.rows.length}개 행)</span>
      </div>
      {previewRows.length > 0 ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {db.columns.slice(0, 4).map((col) => (
                <th key={col.id} className="px-3 py-1.5 text-left text-gray-500 font-medium">
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row) => (
              <tr key={row.id} className="border-b border-gray-50 last:border-0">
                {db.columns.slice(0, 4).map((col) => (
                  <td key={col.id} className="px-3 py-1.5 text-gray-700 truncate max-w-[160px]">
                    {String(row.cells[col.id] ?? '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-3 py-3 text-xs text-gray-400">데이터가 없습니다.</p>
      )}
      {db.rows.length > 3 && (
        <p className="px-3 py-1.5 text-xs text-gray-400 bg-gray-50 border-t border-gray-100">
          {db.rows.length - 3}개 행 더 있음
        </p>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

interface Props {
  section: CampaignSection
  blocks: CampaignBlock[]
  databases: CampaignDatabase[]
  campaignId: string
  onBlockUpdate: (blockId: string, content: Record<string, unknown>) => void
}

export function CampaignSectionDocument({
  section,
  blocks,
  databases,
  onBlockUpdate,
}: Props) {
  const sectionBlocks = blocks
    .filter((b) => b.sectionId === section.id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-10">
        {/* 섹션 제목 */}
        <h1 className="text-2xl font-bold text-gray-900 mb-8 pb-4 border-b border-gray-100">
          {section.title}
        </h1>

        {/* 블록 렌더링 */}
        <div className="space-y-3">
          {sectionBlocks.map((block) => {
            if (block.type === 'heading') {
              return (
                <HeadingBlock
                  key={block.id}
                  block={block}
                  onUpdate={(content) => onBlockUpdate(block.id, content)}
                />
              )
            }
            if (block.type === 'paragraph') {
              return (
                <ParagraphBlock
                  key={block.id}
                  block={block}
                  onUpdate={(content) => onBlockUpdate(block.id, content)}
                />
              )
            }
            if (block.type === 'database_embed') {
              return (
                <DatabaseEmbedBlock
                  key={block.id}
                  block={block}
                  databases={databases}
                />
              )
            }
            return null
          })}

          {sectionBlocks.length === 0 && (
            <p className="text-sm text-gray-400 italic">아직 내용이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  )
}
