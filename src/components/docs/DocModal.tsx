'use client'

import React, { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Doc } from '@/types'
import { X } from 'lucide-react'

interface DocModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: Omit<Doc, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>) => Promise<void>
  doc?: Doc | null
}

const CATEGORIES = ['공지사항', '정책', '가이드', '프로세스', '기술', '마케팅', '기타']

export function DocModal({ isOpen, onClose, onSave, doc }: DocModalProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('기타')
  const [tagsInput, setTagsInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (doc) {
      setTitle(doc.title)
      setContent(doc.content)
      setCategory(doc.category)
      setTags(doc.tags)
    } else {
      setTitle('')
      setContent('')
      setCategory('기타')
      setTags([])
    }
    setTagsInput('')
    setErrors({})
  }, [doc, isOpen])

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!title.trim()) newErrors.title = '제목을 입력하세요'
    if (!content.trim()) newErrors.content = '내용을 입력하세요'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagsInput.trim()) {
      e.preventDefault()
      const newTag = tagsInput.trim().replace(/^#/, '')
      if (!tags.includes(newTag)) {
        setTags([...tags, newTag])
      }
      setTagsInput('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    try {
      await onSave({ title: title.trim(), content: content.trim(), category, tags, isActive: true })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={doc ? '문서 수정' : '문서 추가'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="문서 제목"
          error={errors.title}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-500"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <Textarea
          label="내용"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="문서 내용을 작성하세요..."
          rows={8}
          error={errors.content}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">태그</label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            onKeyDown={handleAddTag}
            placeholder="태그 입력 후 Enter"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-500 mb-2"
          />
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-blue-900"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" className="flex-1" loading={loading}>
            {doc ? '수정' : '추가'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default DocModal
