'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/ariakit/style.css'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/ariakit'
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage'
import { CampaignDocumentContent } from '@/types'
import { getFirebaseApp } from '@/lib/firebase/config'

interface Props {
  content: CampaignDocumentContent
  onChange: (content: CampaignDocumentContent) => void
}

export default function BlockNoteEditorInner({ content, onChange }: Props) {
  const editor = useCreateBlockNote(
    {
      ...(content.blocks && content.blocks.length > 0
        ? { initialContent: content.blocks as any }
        : {}),
      uploadFile: async (file: File) => {
        const app = getFirebaseApp()
        if (!app) throw new Error('Firebase가 초기화되지 않았습니다.')
        const safeName = file.name.replace(/[^\w.\-가-힣]/g, '_')
        const path = `campaign-workspace/${Date.now()}_${safeName}`
        const storageRef = ref(getStorage(app), path)
        await uploadBytes(storageRef, file, { contentType: file.type })
        return getDownloadURL(storageRef)
      },
    }
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
