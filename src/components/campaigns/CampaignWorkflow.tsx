'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { CampaignStage, CampaignTask, CampaignTaskStatus } from '@/types'
import { AlertCircle, CheckCircle2, Circle, Loader2, Plus, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '@/hooks/useAuth'

const STAGES: { key: CampaignStage; label: string }[] = [
  { key: 'discovery', label: '후보 발굴' },
  { key: 'contacting', label: '컨택' },
  { key: 'contracting', label: '계약' },
  { key: 'draft_review', label: '콘텐츠 초안' },
  { key: 'approval', label: '승인' },
  { key: 'publishing', label: '게시' },
  { key: 'performance', label: '성과 수집' },
  { key: 'reporting', label: '리포트' },
]

const STATUS_LABEL: Record<CampaignTaskStatus, string> = {
  todo: '대기',
  doing: '진행',
  done: '완료',
  blocked: '막힘',
}

export function CampaignWorkflow({ campaignId }: { campaignId: string }) {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<CampaignTask[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [stage, setStage] = useState<CampaignStage>('discovery')
  const [error, setError] = useState('')

  const load = async (ensure = false) => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const token = await user.getIdToken()
      const res = await fetch(`/api/campaigns/${campaignId}/tasks${ensure ? '?ensure=1' : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '워크플로우를 불러올 수 없습니다.')
      setTasks(data.tasks ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '워크플로우를 불러올 수 없습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, user])

  const byStage = useMemo(() => {
    const grouped: Record<string, CampaignTask[]> = {}
    STAGES.forEach((s) => { grouped[s.key] = [] })
    tasks.forEach((task) => {
      grouped[task.stage] = grouped[task.stage] ?? []
      grouped[task.stage].push(task)
    })
    return grouped
  }, [tasks])

  const createTask = async () => {
    if (!title.trim()) return
    if (!user) return
    setSaving(true)
    setError('')
    try {
      const token = await user.getIdToken()
      const res = await fetch(`/api/campaigns/${campaignId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, stage }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '태스크를 생성할 수 없습니다.')
      setTitle('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '태스크를 생성할 수 없습니다.')
    } finally {
      setSaving(false)
    }
  }

  const updateTask = async (task: CampaignTask, patch: Partial<CampaignTask>) => {
    if (!user) return
    const token = await user.getIdToken()
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...patch } : t)))
    const res = await fetch(`/api/campaigns/${campaignId}/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    })
    if (!res.ok) await load()
  }

  const removeTask = async (task: CampaignTask) => {
    if (!user) return
    const token = await user.getIdToken()
    setTasks((prev) => prev.filter((t) => t.id !== task.id))
    const res = await fetch(`/api/campaigns/${campaignId}/tasks/${task.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) await load()
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">캠페인 워크플로우</h2>
            <p className="text-xs text-gray-400 mt-0.5">후보 발굴부터 리포트까지 단계별 실행 상태</p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            기본 태스크 생성
          </button>
        </div>

        <div className="flex gap-2 mb-5">
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as CampaignStage)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white"
          >
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="새 태스크..."
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400"
          />
          <button
            onClick={createTask}
            disabled={saving || !title.trim()}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            추가
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl px-3 py-2 mb-4 text-sm bg-red-50 text-red-700 border border-red-100">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12 text-gray-300"><Loader2 size={20} className="animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {STAGES.map((s) => (
              <div key={s.key} className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                  <span className="text-xs font-semibold text-gray-700">{s.label}</span>
                  <span className="text-xs text-gray-400">{byStage[s.key]?.length ?? 0}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {(byStage[s.key] ?? []).length === 0 ? (
                    <p className="text-xs text-gray-300 px-3 py-4">태스크 없음</p>
                  ) : (
                    byStage[s.key].map((task) => (
                      <div key={task.id} className="flex items-center gap-2 px-3 py-2">
                        <button
                          onClick={() => updateTask(task, { status: task.status === 'done' ? 'todo' : 'done' })}
                          className={task.status === 'done' ? 'text-green-500' : 'text-gray-300'}
                        >
                          {task.status === 'done' ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={clsx('text-sm truncate', task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800')}>
                            {task.title}
                          </p>
                          <select
                            value={task.status}
                            onChange={(e) => updateTask(task, { status: e.target.value as CampaignTaskStatus })}
                            className="text-xs text-gray-400 bg-transparent outline-none"
                          >
                            {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                          </select>
                        </div>
                        <button onClick={() => removeTask(task)} className="text-gray-300 hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
