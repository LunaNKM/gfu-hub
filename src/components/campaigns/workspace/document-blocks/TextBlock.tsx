'use client'

import { useState } from 'react'
import type { CampaignBlock } from '@/types'

export function TextBlock({
  block,
  type,
  onUpdate,
}: {
  block: CampaignBlock
  type: 'heading' | 'paragraph'
  onUpdate: (content: Record<string, unknown>) => void
}) {
  const [draft, setDraft] = useState(String(block.content.text ?? ''))
  const commit = () => onUpdate({ ...block.content, text: draft })

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
