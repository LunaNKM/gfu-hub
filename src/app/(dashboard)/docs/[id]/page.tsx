'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getDoc, updateDoc, deleteDoc } from '@/lib/services/docs'
import { Doc } from '@/types'
import { DocDetail } from '@/components/docs/DocDetail'
import { DocModal } from '@/components/docs/DocModal'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { ErrorState } from '@/components/ui/ErrorState'

export default function DocDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const { showToast } = useToast()

  const [doc, setDoc] = useState<Doc | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (id) {
      getDoc(id).then((d) => {
        if (!d) setNotFound(true)
        else setDoc(d)
        setLoading(false)
      })
    }
  }, [id])

  const handleSave = async (data: Omit<Doc, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>) => {
    if (!doc || !user) return
    await updateDoc(doc.id, { ...data, updatedBy: user.uid })
    const updated = await getDoc(doc.id)
    setDoc(updated)
    showToast('문서가 수정되었습니다.', 'success')
  }

  const handleDelete = async () => {
    if (!doc) return
    if (!confirm('이 문서를 삭제하시겠습니까?')) return
    await deleteDoc(doc.id)
    showToast('문서가 삭제되었습니다.', 'success')
    router.push('/docs')
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (notFound || !doc) {
    return <ErrorState message="문서를 찾을 수 없습니다." />
  }

  return (
    <>
      <DocDetail doc={doc} onEdit={() => setModalOpen(true)} onDelete={handleDelete} />
      <DocModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        doc={doc}
      />
    </>
  )
}
