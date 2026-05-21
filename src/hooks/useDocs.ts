'use client'

import { useState, useEffect, useCallback } from 'react'
import { Doc } from '@/types'
import {
  getDocs as fetchDocsFromFirestore,
  createDoc as createDocInFirestore,
  updateDoc as updateDocInFirestore,
  deleteDoc as deleteDocInFirestore,
  createDocChunks,
} from '@/lib/services/docs'
import { useAuth } from './useAuth'

// 임베딩 생성을 백그라운드에서 트리거 (fire-and-forget)
// createDocChunks 직후 호출 → 실패해도 청크는 보존되므로 검색 가능 (임베딩 없으면 키워드 폴백)
async function triggerEmbed(docId: string, token: string): Promise<void> {
  try {
    await fetch('/api/docs/embed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ docId }),
    })
  } catch (err) {
    console.error('임베딩 트리거 실패:', err)
  }
}

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
    const docId = await createDocInFirestore({
      ...data,
      createdBy: user.uid,
      updatedBy: user.uid,
    })
    // 청크 생성 (동기) → 임베딩 생성 (백그라운드, fire-and-forget)
    await createDocChunks(docId, data.content, data.title, data.category, data.tags)
    user.getIdToken().then((token) => triggerEmbed(docId, token))
    await fetchDocs()
  }

  const handleUpdateDoc = async (id: string, data: Partial<Doc>) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    await updateDocInFirestore(id, { ...data, updatedBy: user.uid })
    // 검색 관련 필드가 변경된 경우 청크 + 임베딩 재생성
    const needsRechunk =
      data.content !== undefined ||
      data.title !== undefined ||
      data.category !== undefined ||
      data.tags !== undefined
    if (needsRechunk) {
      const existing = docs.find((d) => d.id === id)
      if (existing) {
        const content = data.content ?? existing.content
        const title = data.title ?? existing.title
        const category = data.category ?? existing.category
        const tags = data.tags ?? existing.tags
        await createDocChunks(id, content, title, category, tags)
        user.getIdToken().then((token) => triggerEmbed(id, token))
      }
    }
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
