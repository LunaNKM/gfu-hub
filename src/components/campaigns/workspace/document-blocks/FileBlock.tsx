'use client'

import { File } from 'lucide-react'
import type { CampaignBlock } from '@/types'

export function FileBlock({
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
        첨부 파일
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={(event) => onUpdate({ ...block.content, name: event.target.value })} placeholder="파일명" className="rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400" />
        <input value={url} onChange={(event) => onUpdate({ ...block.content, url: event.target.value })} placeholder="파일 URL" className="rounded border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400" />
      </div>
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-blue-600">
          {name || '파일 열기'}
        </a>
      )}
    </div>
  )
}
