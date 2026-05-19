'use client'

import React, { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { App } from '@/types'

interface AppModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: Omit<App, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>) => Promise<void>
  app?: App | null
}

const CATEGORIES = ['업무', '개발', '디자인', '마케팅', '분석', '커뮤니케이션', '기타']

export function AppModal({ isOpen, onClose, onSave, app }: AppModalProps) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [icon, setIcon] = useState('🔗')
  const [category, setCategory] = useState('업무')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (app) {
      setName(app.name)
      setUrl(app.url)
      setIcon(app.icon)
      setCategory(app.category)
    } else {
      setName('')
      setUrl('')
      setIcon('🔗')
      setCategory('업무')
    }
    setErrors({})
  }, [app, isOpen])

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!name.trim()) newErrors.name = '앱 이름을 입력하세요'
    if (!url.trim()) newErrors.url = 'URL을 입력하세요'
    else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      newErrors.url = 'http:// 또는 https://로 시작해야 합니다'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    try {
      await onSave({ name: name.trim(), url: url.trim(), icon, category })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={app ? '앱 수정' : '앱 추가'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 아이콘 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">아이콘 (이모지)</label>
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="w-16 h-10 text-center text-xl border border-gray-200 rounded-lg outline-none focus:border-blue-500"
            maxLength={2}
          />
        </div>

        <Input
          label="앱 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: Notion"
          error={errors.name}
        />

        <Input
          label="URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.notion.so"
          type="url"
          error={errors.url}
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

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" className="flex-1" loading={loading}>
            {app ? '수정' : '추가'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default AppModal
