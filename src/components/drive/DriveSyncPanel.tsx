'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, Cloud, Settings } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

interface DriveStatus {
  configured: boolean
  driveDocCount: number
  lastSyncAt: string | null
}

interface SyncResult {
  synced: number
  skipped: number
  errors: string[]
}

export function DriveSyncPanel() {
  const { user } = useAuth()
  const { showToast } = useToast()

  const [status, setStatus] = useState<DriveStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!user) return
    try {
      const token = await user.getIdToken()
      const res = await fetch('/api/drive/status', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setStatus(data)
    } catch {
      setStatus({ configured: false, driveDocCount: 0, lastSyncAt: null })
    } finally {
      setLoadingStatus(false)
    }
  }, [user])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleSync = async () => {
    if (!user) return
    setSyncing(true)
    setErrorMessage(null)
    setLastResult(null)
    setProgress(0)

    let totalSynced = 0
    let totalSkipped = 0
    const allErrors: string[] = []
    let cursor: number | null = 0

    try {
      const token = await user.getIdToken()

      while (cursor !== null) {
        const res: Response = await fetch('/api/drive/sync', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cursor }),
        })

        const data = await res.json()

        if (!res.ok) {
          setErrorMessage(data.error || '동기화에 실패했습니다.')
          showToast(data.error || '동기화에 실패했습니다.', 'error')
          return
        }

        totalSynced += data.synced ?? 0
        totalSkipped += data.skipped ?? 0
        if (data.errors) allErrors.push(...data.errors)
        setProgress(data.progress ?? 100)

        cursor = data.nextCursor ?? null
      }

      const result = { synced: totalSynced, skipped: totalSkipped, errors: allErrors }
      setLastResult(result)

      if (allErrors.length > 0) {
        showToast(`동기화 완료 (${totalSynced}개 동기화, ${allErrors.length}개 오류)`, 'info')
      } else {
        showToast(`동기화 완료 (${totalSynced}개 동기화, ${totalSkipped}개 건너뜀)`, 'success')
      }

      await fetchStatus()
    } catch {
      setErrorMessage('네트워크 오류가 발생했습니다.')
      showToast('동기화 중 오류가 발생했습니다.', 'error')
    } finally {
      setSyncing(false)
      setProgress(0)
    }
  }

  if (loadingStatus) return null

  if (!status?.configured) {
    return (
      <Card className="p-4 mb-6 border border-amber-200 bg-amber-50">
        <div className="flex items-start gap-3">
          <Settings size={18} className="text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">Google Drive 연동 미설정</p>
            <p className="text-xs text-amber-700 mt-1">
              Drive 파일을 자동으로 동기화하려면 환경변수를 설정하세요.
            </p>
            <div className="mt-2 bg-amber-100 rounded p-2 text-xs font-mono text-amber-900 space-y-1">
              <div>GOOGLE_OAUTH_CLIENT_ID=...</div>
              <div>GOOGLE_OAUTH_CLIENT_SECRET=...</div>
              <div>GOOGLE_OAUTH_REFRESH_TOKEN=...</div>
              <div>GOOGLE_DRIVE_FOLDER_ID=1xxxxxxxx...</div>
            </div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4 mb-6 border border-blue-200 bg-blue-50">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Cloud size={18} className="text-blue-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900">Google Drive 동기화</p>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-blue-700">
                Drive 문서 {status.driveDocCount}개 연동됨
              </span>
              {status.lastSyncAt && (
                <span className="text-xs text-blue-500">
                  마지막 동기화:{' '}
                  {new Date(status.lastSyncAt).toLocaleString('ko-KR', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>

            {syncing && progress > 0 && (
              <div className="mt-2 w-48">
                <div className="flex justify-between text-xs text-blue-600 mb-1">
                  <span>동기화 중...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {lastResult && (
              <div className="flex items-center gap-2 mt-1">
                <CheckCircle size={13} className="text-green-600" />
                <span className="text-xs text-green-700">
                  {lastResult.synced}개 동기화 완료, {lastResult.skipped}개 건너뜀
                </span>
              </div>
            )}

            {errorMessage && (
              <div className="flex items-center gap-2 mt-1">
                <AlertCircle size={13} className="text-red-500" />
                <span className="text-xs text-red-600">{errorMessage}</span>
              </div>
            )}

            {lastResult && lastResult.errors.length > 0 && (
              <div className="mt-1">
                <p className="text-xs text-red-600">오류 발생 파일:</p>
                <ul className="text-xs text-red-500 list-disc list-inside">
                  {lastResult.errors.slice(0, 3).map((e, i) => (
                    <li key={i} className="truncate max-w-xs">{e}</li>
                  ))}
                  {lastResult.errors.length > 3 && (
                    <li>외 {lastResult.errors.length - 3}개</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>

        <Button
          size="sm"
          variant="secondary"
          onClick={handleSync}
          disabled={syncing}
        >
          <RefreshCw size={14} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? `동기화 중... ${progress}%` : '지금 동기화'}
        </Button>
      </div>
    </Card>
  )
}

export default DriveSyncPanel
