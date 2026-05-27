'use client'

import type React from 'react'
import type { CampaignBlock, CampaignDatabase } from '@/types'
import { BlockChrome } from './BlockChrome'
import { ChartEmbedBlock } from './ChartEmbedBlock'
import { DatabaseEmbedBlock } from './DatabaseEmbedBlock'
import { FileBlock } from './FileBlock'
import { ImageBlock } from './ImageBlock'
import { SimpleTableBlock } from './SimpleTableBlock'
import { TextBlock } from './TextBlock'

export function DocumentBlockRenderer({
  block,
  sectionId,
  databases,
  onBlockUpdate,
  onBlockPatch,
  onBlockDelete,
  onBlockMove,
  onDatabaseUpdate,
}: {
  block: CampaignBlock
  sectionId: string
  databases: CampaignDatabase[]
  onBlockUpdate: (blockId: string, content: Record<string, unknown>) => void
  onBlockPatch: (blockId: string, patch: Partial<CampaignBlock>) => void
  onBlockDelete: (blockId: string) => void
  onBlockMove: (sectionId: string, blockId: string, direction: 'up' | 'down') => void
  onDatabaseUpdate?: (databaseId: string, patch: Partial<CampaignDatabase>) => void
}) {
  let body: React.ReactNode = null

  if (block.type === 'heading' || block.type === 'paragraph') {
    body = <TextBlock block={block} type={block.type} onUpdate={(content) => onBlockUpdate(block.id, content)} />
  } else if (block.type === 'database_embed') {
    body = <DatabaseEmbedBlock block={block} databases={databases} onUpdate={(content) => onBlockUpdate(block.id, content)} onDatabaseUpdate={onDatabaseUpdate} />
  } else if (block.type === 'chart_embed') {
    body = <ChartEmbedBlock block={block} databases={databases} onUpdate={(content) => onBlockUpdate(block.id, content)} />
  } else if (block.type === 'simple_table') {
    body = <SimpleTableBlock block={block} onUpdate={(content) => onBlockUpdate(block.id, content)} />
  } else if (block.type === 'image') {
    body = <ImageBlock block={block} onUpdate={(content) => onBlockUpdate(block.id, content)} />
  } else if (block.type === 'file') {
    body = <FileBlock block={block} onUpdate={(content) => onBlockUpdate(block.id, content)} />
  }

  return (
    <BlockChrome
      block={block}
      sectionId={sectionId}
      onPatch={(patch) => onBlockPatch(block.id, patch)}
      onDelete={() => {
        if (confirm('이 블록을 삭제할까요?')) onBlockDelete(block.id)
      }}
      onMove={(direction) => onBlockMove(sectionId, block.id, direction)}
    >
      {body}
    </BlockChrome>
  )
}
