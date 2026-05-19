'use client'

import React, { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useApps } from '@/hooks/useApps'
import { App } from '@/types'
import { AppCard } from '@/components/apps/AppCard'
import { AppModal } from '@/components/apps/AppModal'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { AppWindow } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

export default function AppsPage() {
  const { apps, loading, error, createApp, updateApp, deleteApp, refetch } = useApps()
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('전체')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingApp, setEditingApp] = useState<App | null>(null)

  const categories = ['전체', ...Array.from(new Set(apps.map((a) => a.category)))]

  const filtered = apps.filter((app) => {
    const matchSearch =
      !search ||
      app.name.toLowerCase().includes(search.toLowerCase()) ||
      app.url.toLowerCase().includes(search.toLowerCase())
    const matchCategory = selectedCategory === '전체' || app.category === selectedCategory
    return matchSearch && matchCategory
  })

  const handleSave = async (data: Omit<App, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>) => {
    try {
      if (editingApp) {
        await updateApp(editingApp.id, data)
        showToast('앱이 수정되었습니다.', 'success')
      } else {
        await createApp(data)
        showToast('앱이 추가되었습니다.', 'success')
      }
    } catch {
      showToast('저장에 실패했습니다.', 'error')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 앱을 삭제하시겠습니까?')) return
    try {
      await deleteApp(id)
      showToast('앱이 삭제되었습니다.', 'success')
    } catch {
      showToast('삭제에 실패했습니다.', 'error')
    }
  }

  const handleEdit = (app: App) => {
    setEditingApp(app)
    setModalOpen(true)
  }

  const handleModalClose = () => {
    setModalOpen(false)
    setEditingApp(null)
  }

  return (
    <div className="p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">앱 런처</h1>
          <p className="text-sm text-gray-500 mt-0.5">자주 사용하는 업무 앱 모음</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={16} className="mr-1.5" />
          앱 추가
        </Button>
      </div>

      {/* 검색 + 필터 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="앱 검색..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 컨텐츠 */}
      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="앱이 없습니다"
          description={search ? '검색 결과가 없습니다.' : '첫 번째 앱을 추가해보세요.'}
          icon={<AppWindow size={48} />}
          action={
            !search && (
              <Button onClick={() => setModalOpen(true)}>
                <Plus size={16} className="mr-1.5" />
                앱 추가
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* 모달 */}
      <AppModal
        isOpen={modalOpen}
        onClose={handleModalClose}
        onSave={handleSave}
        app={editingApp}
      />
    </div>
  )
}
