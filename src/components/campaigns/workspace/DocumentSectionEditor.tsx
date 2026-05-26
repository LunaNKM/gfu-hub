'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import { CampaignDocumentContent } from '@/types'

const BlockNoteEditorInner = dynamic(
  () => import('./BlockNoteEditorInner'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-48 text-gray-300">
        <Loader2 size={20} className="animate-spin" />
      </div>
    ),
  }
)

interface Props {
  content: CampaignDocumentContent
  onChange: (content: CampaignDocumentContent) => void
}

export function DocumentSectionEditor({ content, onChange }: Props) {
  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <BlockNoteEditorInner content={content} onChange={onChange} />
    </div>
  )
}
