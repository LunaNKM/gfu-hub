'use client'

import { useState, useEffect, useCallback } from 'react'
import { App } from '@/types'
import { getApps, createApp, updateApp, deleteApp } from '@/lib/services/apps'
import { useAuth } from './useAuth'

export function useApps() {
  const [apps, setApps] = useState<App[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  const fetchApps = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getApps()
      setApps(data)
    } catch (err) {
      setError('앱 목록을 불러오는 데 실패했습니다.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) {
      fetchApps()
    }
  }, [user, fetchApps])

  const handleCreateApp = async (data: Omit<App, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    await createApp({
      ...data,
      createdBy: user.uid,
      updatedBy: user.uid,
    })
    await fetchApps()
  }

  const handleUpdateApp = async (id: string, data: Partial<App>) => {
    if (!user) throw new Error('로그인이 필요합니다.')
    await updateApp(id, { ...data, updatedBy: user.uid })
    await fetchApps()
  }

  const handleDeleteApp = async (id: string) => {
    await deleteApp(id)
    await fetchApps()
  }

  return {
    apps,
    loading,
    error,
    createApp: handleCreateApp,
    updateApp: handleUpdateApp,
    deleteApp: handleDeleteApp,
    refetch: fetchApps,
  }
}
