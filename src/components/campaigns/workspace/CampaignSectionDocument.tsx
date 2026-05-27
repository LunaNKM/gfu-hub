'use client'

import { useMemo } from 'react'
import { ListPlus } from 'lucide-react'
import type {
  CampaignBlock,
  CampaignBlockType,
  CampaignCellValue,
  CampaignDataColumn,
  CampaignDatabase,
  CampaignSection,
} from '@/types'
import { AddBlockBar } from './document-blocks/AddBlockBar'
import { DocumentBlockRenderer } from './document-blocks/DocumentBlockRenderer'

interface Props {
  section: CampaignSection
  blocks: CampaignBlock[]
  databases: CampaignDatabase[]
  onBlockUpdate: (blockId: string, content: Record<string, unknown>) => void
  onBlockPatch: (blockId: string, patch: Partial<CampaignBlock>) => void
  onBlockAdd: (
    sectionId: string,
    type: CampaignBlockType,
    content?: Record<string, unknown>
  ) => void
  onBlockDelete: (blockId: string) => void
  onBlockMove: (sectionId: string, blockId: string, direction: 'up' | 'down') => void
  onDatabaseCellChange?: (databaseId: string, rowId: string, colId: string, value: CampaignCellValue) => void
  onDatabaseRowAdd?: (databaseId: string) => void
  onDatabaseRowsDelete?: (databaseId: string, rowIds: string[]) => void
  onDatabaseColumnsChange?: (databaseId: string, columns: CampaignDataColumn[]) => void
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
  onDatabaseCellChange,
  onDatabaseRowAdd,
  onDatabaseRowsDelete,
  onDatabaseColumnsChange,
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
          {sectionBlocks.map((block) => (
            <DocumentBlockRenderer
              key={block.id}
              block={block}
              sectionId={section.id}
              databases={databases}
              onBlockUpdate={onBlockUpdate}
              onBlockPatch={onBlockPatch}
              onBlockDelete={onBlockDelete}
              onBlockMove={onBlockMove}
              onDatabaseCellChange={onDatabaseCellChange}
              onDatabaseRowAdd={onDatabaseRowAdd}
              onDatabaseRowsDelete={onDatabaseRowsDelete}
              onDatabaseColumnsChange={onDatabaseColumnsChange}
            />
          ))}

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
