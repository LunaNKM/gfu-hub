'use client'

import React from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import type { CampaignBlock } from '@/types'

export function BlockChrome({
  block,
  sectionId,
  children,
  onPatch,
  onDelete,
  onMove,
}: {
  block: CampaignBlock
  sectionId: string
  children: React.ReactNode
  onPatch: (patch: Partial<CampaignBlock>) => void
  onDelete: () => void
  onMove: (direction: 'up' | 'down') => void
}) {
  return (
    <div className="group relative -ml-24 grid grid-cols-[88px_minmax(0,1fr)] rounded-md border border-transparent py-1 pr-2 hover:border-gray-100 hover:bg-[#f7f7f5] focus-within:border-gray-100 focus-within:bg-[#f7f7f5]">
      <div className="flex items-start justify-end gap-1 pr-2 pt-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button type="button" onClick={() => onMove('up')} className="rounded border border-gray-200 bg-white p-1 text-gray-400 hover:text-gray-700" title="위로 이동">
          <ArrowUp size={12} />
        </button>
        <button type="button" onClick={() => onMove('down')} className="rounded border border-gray-200 bg-white p-1 text-gray-400 hover:text-gray-700" title="아래로 이동">
          <ArrowDown size={12} />
        </button>
        <button type="button" onClick={onDelete} className="rounded border border-gray-200 bg-white p-1 text-gray-400 hover:text-red-500" title="삭제">
          <Trash2 size={12} />
        </button>
      </div>

      <div className="absolute right-2 top-1 hidden items-center gap-2 group-hover:flex group-focus-within:flex">
        <label className="flex items-center gap-1 text-[11px] text-gray-400">
          <input type="checkbox" checked={block.clientVisible} onChange={(event) => onPatch({ clientVisible: event.target.checked })} className="h-3 w-3" />
          고객 공개
        </label>
        <label className="flex items-center gap-1 text-[11px] text-gray-400">
          <input type="checkbox" checked={block.clientEditable} onChange={(event) => onPatch({ clientEditable: event.target.checked })} className="h-3 w-3" />
          고객 수정
        </label>
      </div>

      <div data-section-id={sectionId} className="min-w-0">
        {children}
      </div>
    </div>
  )
}
