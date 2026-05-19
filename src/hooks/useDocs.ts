'use client'

import { useState, useEffect, useCallback } from 'react'
import { Doc } from '@/types'
import {
  getDocs as fetchDocsFromFirestore,
  createDoc as createDocInFirestore,
  updateDoc as updateDocInFirestore,
  deleteDoc as deleteDocInFirestore,
} from '@/lib/services/docs'
import { useAuth } from './useAuth'

export function useDocs() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDocsFromFirestore()
      setDocs(data)
    } catch (err) {
      setError('문서 목록을 불러오는 데 실패했습니다.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) {
      fetchDocs()
    }
  }, [user, fetchDocs])

  const handleCreateDoc = async (data: Omit<Doc, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    await createDocInFirestore({
      ...data,
      createdBy: user.uid,
      updatedBy: user.uid,
    })
    await fetchDocs()
  }

  const handleUpdateDoc = async (id: string, data: Partial<Doc>) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    await updateDocInFirestore(id, { ...data, updatedBy: user.uid })
    await fetchDocs()
  }

  const handleDeleteDoc = async (id: string) => {
    await deleteDocInFirestore(id)
    await fetchDocs()
  }

  return {
    docs,
    loading,
    error,
    createDoc: handleCreateDoc,
    updateDoc: handleUpdateDoc,
    deleteDoc: handleDeleteDoc,
    refetch: fetchDocs,
  }
}
