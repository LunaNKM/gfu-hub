'use client'

import React from 'react'
import { BarChart3, Database, File, Heading2, Image as ImageIcon, Table2, Type } from 'lucide-react'
import type { CampaignBlockType, CampaignDatabase } from '@/types'

function defaultBlockContent(type: CampaignBlockType, databases: CampaignDatabase[]): Record<string, unknown> {
  const firstDatabase = databases[0]
  if (type === 'heading') return { text: '' }
  if (type === 'paragraph') return { text: '' }
  if (type === 'database_embed') return { databaseId: firstDatabase?.id ?? '' }
  if (type === 'chart_embed') return { databaseId: firstDatabase?.id ?? '', chartId: '' }
  if (type === 'simple_table') return { rows: [['', '', ''], ['', '', ''], ['', '', '']] }
  if (type === 'image') return { url: '', caption: '' }
  if (type === 'file') return { name: '', url: '' }
  return {}
}

export function AddBlockBar({
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
