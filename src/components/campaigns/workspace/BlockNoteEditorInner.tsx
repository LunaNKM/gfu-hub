'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/ariakit/style.css'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/ariakit'
import { CampaignDocumentContent } from '@/types'

interface Props {
  content: CampaignDocumentContent
  onChange: (content: CampaignDocumentContent) => void
}

export default function BlockNoteEditorInner({ content, onChange }: Props) {
  const editor = useCreateBlockNote(
    content.blocks && content.blocks.length > 0
      ? { initialContent: content.blocks as any }
      : {}
  )

  return (
    <BlockNoteView
      editor={editor as any}
      onChange={() => {
        onChange({ blocks: (editor as any).document as unknown[] })
      }}
      className="min-h-96"
    />
  )
}
