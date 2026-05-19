'use client'

import React, { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useDocs } from '@/hooks/useDocs'
import { Doc } from '@/types'
import { DocCard } from '@/components/docs/DocCard'
import { DocModal } from '@/components/docs/DocModal'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { FileText } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { DriveSyncPanel } from '@/components/drive/DriveSyncPanel'

export default function DocsPage() {
  const { docs, loading, error, createDoc, updateDoc, deleteDoc, refetch } = useDocs()
  const { showToast } = useToast()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [selectedCategory, setSelectedCategory] = useState('전체')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState<Doc | null>(null)

  useEffect(() => {
    const q = searchParams.get('q')
    if (q) setSearch(q)
  }, [searchParams])

  const categories = ['전체', ...Array.from(new Set(docs.map((d) => d.category)))]

  const filtered = docs.filter((doc) => {
    const matchSearch =
      !search ||
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      doc.content.toLowerCase().includes(search.toLowerCase()) ||
      doc.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
    const matchCategory = selectedCategory === '전체' || doc.category === selectedCategory
    return matchSearch && matchCategory
  })

  const handleSave = async (data: Omit<Doc, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>) => {
    try {
      if (editingDoc) {
        await updateDoc(editingDoc.id, data)
        showToast('문서가 수정되었습니다.', 'success')
      } else {
        await createDoc(data)
        showToast('문서가 추가되었습니다.', 'success')
      }
    } catch {
      showToast('저장에 실패했습니다.', 'error')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 문서를 삭제하시겠습니까?')) return
    try {
      await deleteDoc(id)
      showToast('문서가 삭제되었습니다.', 'success')
    } catch {
      showToast('삭제에 실패했습니다.', 'error')
    }
  }

  const handleEdit = (doc: Doc) => {
    setEditingDoc(doc)
    setModalOpen(true)
  }

  const handleModalClose = () => {
    setModalOpen(false)
    setEditingDoc(null)
  }

  return (
    <div className="p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">문서 허브</h1>
          <p className="text-sm text-gray-500 mt-0.5">사내 문서 검색 및 관리</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={16} className="mr-1.5" />
          문서 추가
        </Button>
      </div>

      {/* Google Drive 동기화 패널 */}
      <DriveSyncPanel />

      {/* 검색 + 필터 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="문서 검색..."
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
          title="문서가 없습니다"
          description={search ? '검색 결과가 없습니다.' : '첫 번째 문서를 추가해보세요.'}
          icon={<FileText size={48} />}
          action={
            !search && (
              <Button onClick={() => setModalOpen(true)}>
                <Plus size={16} className="mr-1.5" />
                문서 추가
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* 모달 */}
      <DocModal
        isOpen={modalOpen}
        onClose={handleModalClose}
        onSave={handleSave}
        doc={editingDoc}
      />
    </div>
  )
}
