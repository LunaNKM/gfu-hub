'use client'

import React from 'react'
import Link from 'next/link'
import { Edit2, Trash2 } from 'lucide-react'
import { Doc } from '@/types'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Badge } from '@/components/ui/Badge'

interface DocCardProps {
  doc: Doc
  onEdit: (doc: Doc) => void
  onDelete: (id: string) => void
}

export function DocCard({ doc, onEdit, onDelete }: DocCardProps) {
  return (
    <div className="group bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2 mb-2">
        <Link href={`/docs/${doc.id}`} className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 hover:text-blue-600 truncate transition-colors">
            {doc.title}
          </h3>
        </Link>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => onEdit(doc)}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={() => onDelete(doc.id)}
            className="p-1 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500 line-clamp-2 mb-3">
        {doc.content.slice(0, 120)}
        {doc.content.length > 120 && '...'}
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="blue">{doc.category}</Badge>
          {doc.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="default">#{tag}</Badge>
          ))}
        </div>
        <span className="text-xs text-gray-400 shrink-0">
          {format(doc.updatedAt, 'M.d', { locale: ko })}
        </span>
      </div>
    </div>
  )
}

export default DocCard
