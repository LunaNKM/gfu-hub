'use client'

import Image from 'next/image'
import type { CampaignBlock } from '@/types'

export function ImageBlock({
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
      {url && (
        <div className="relative h-80 max-w-full overflow-hidden rounded border border-gray-100">
          <Image src={url} alt={caption || '첨부 이미지'} fill className="object-contain" unoptimized />
        </div>
      )}
      <input
        value={caption}
        onChange={(event) => onUpdate({ ...block.content, caption: event.target.value })}
        placeholder="캡션"
        className="w-full bg-transparent text-xs text-gray-500 outline-none placeholder:text-gray-300"
      />
    </div>
  )
}
