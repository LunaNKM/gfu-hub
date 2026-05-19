'use client'

import React from 'react'
import { Doc } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Edit2, Trash2, ArrowLeft } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import Link from 'next/link'

interface DocDetailProps {
  doc: Doc
  onEdit: () => void
  onDelete: () => void
}

export function DocDetail({ doc, onEdit, onDelete }: DocDetailProps) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* 뒤로가기 */}
      <Link
        href="/docs"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        문서 목록
      </Link>

      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{doc.title}</h1>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <Badge variant="blue">{doc.category}</Badge>
            <span>수정: {format(doc.updatedAt, 'yyyy.MM.dd HH:mm', { locale: ko })}</span>
          </div>
          {doc.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {doc.tags.map((tag) => (
                <Badge key={tag} variant="default">#{tag}</Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <Edit2 size={14} className="mr-1" />
            수정
          </Button>
          <Button variant="danger" size="sm" onClick={onDelete}>
            <Trash2 size={14} className="mr-1" />
            삭제
          </Button>
        </div>
      </div>

      {/* 내용 */}
      <div className="prose prose-sm max-w-none">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
            {doc.content}
          </pre>
        </div>
      </div>
    </div>
  )
}

export default DocDetail
