'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Campaign, CampaignStatus } from '@/types'
import { useRouter } from 'next/navigation'
import { Plus, Briefcase, Calendar, CircleDollarSign, X, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

// ── 상수 ─────────────────────────────────────────────────────────
const COLUMNS: { status: CampaignStatus; label: string; color: string; bg: string }[] = [
  { status: 'proposal', label: '제안',     color: 'text-amber-600',  bg: 'bg-amber-50'  },
  { status: 'active',   label: '진행 중',  color: 'text-blue-600',   bg: 'bg-blue-50'   },
  { status: 'completed',label: '완료',     color: 'text-green-600',  bg: 'bg-green-50'  },
]

const STATUS_BADGE: Record<CampaignStatus, string> = {
  proposal:  'bg-amber-100 text-amber-700',
  active:    'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
}

function fmt(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000)      return `${(n / 10_000).toFixed(0)}만`
  return n.toLocaleString()
}

function dateRange(start: string, end: string) {
  if (!start && !end) return null
  const s = start ? format(new Date(start), 'yy.MM.dd', { locale: ko }) : '?'
  const e = end   ? format(new Date(end),   'yy.MM.dd', { locale: ko }) : '?'
  return `${s} ~ ${e}`
}

// ── 캠페인 카드 ───────────────────────────────────────────────────
function CampaignCard({ campaign, onClick }: { campaign: Campaign; onClick: () => void }) {
  const range = dateRange(campaign.startDate, campaign.endDate)
  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs text-gray-400 font-medium truncate">{campaign.clientName}</p>
        <span className={clsx('text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0', STATUS_BADGE[campaign.status])}>
          {COLUMNS.find(c => c.status === campaign.status)?.label}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 mb-3 line-clamp-2">{campaign.campaignName}</h3>
      <div className="space-y-1.5">
        {range && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Calendar size={12} className="shrink-0 text-gray-400" />
            {range}
          </div>
        )}
        {campaign.budget > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <CircleDollarSign size={12} className="shrink-0 text-gray-400" />
            {fmt(campaign.budget)}원
          </div>
        )}
      </div>
    </div>
  )
}

// ── 새 캠페인 모달 ────────────────────────────────────────────────
interface NewCampaignModalProps {
  onClose: () => void
  onCreated: () => void
  token: string
}

function NewCampaignModal({ onClose, onCreated, token }: NewCampaignModalProps) {
  const [form, setForm] = useState({
    clientName: '',
    campaignName: '',
    status: 'proposal' as CampaignStatus,
    startDate: '',
    endDate: '',
    budget: '',
    memo: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.clientName.trim() || !form.campaignName.trim()) {
      setError('클라이언트명과 캠페인명은 필수입니다.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, budget: Number(form.budget.replace(/,/g, '')) || 0 }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? '생성 실패')
      }
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">새 캠페인</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">클라이언트명 *</label>
              <input value={form.clientName} onChange={set('clientName')} placeholder="예: 삼성전자"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">상태</label>
              <select value={form.status} onChange={set('status')}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400">
                {COLUMNS.map(c => <option key={c.status} value={c.status}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">캠페인명 *</label>
            <input value={form.campaignName} onChange={set('campaignName')} placeholder="예: 2025 여름 인플루언서 마케팅"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">시작일</label>
              <input type="date" value={form.startDate} onChange={set('startDate')}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">종료일</label>
              <input type="date" value={form.endDate} onChange={set('endDate')}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">예산 (원)</label>
            <input value={form.budget} onChange={set('budget')} placeholder="예: 10000000"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">메모</label>
            <textarea value={form.memo} onChange={set('memo')} rows={2} placeholder="간단한 메모..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 resize-none" />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              취소
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />}
              생성
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── 메인 페이지 ───────────────────────────────────────────────────
export default function CampaignsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const token = user?.uid ?? ''

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/campaigns', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setCampaigns(data.campaigns ?? [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const byCols = (status: CampaignStatus) => campaigns.filter(c => c.status === status)

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">캠페인 허브</h1>
          <p className="text-xs text-gray-400 mt-0.5">진행 중인 클라이언트 캠페인 관리</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
        >
          <Plus size={15} />
          새 캠페인
        </button>
      </div>

      {/* 칸반 보드 */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-6 h-full min-w-[700px]">
          {COLUMNS.map(col => {
            const cards = byCols(col.status)
            return (
              <div key={col.status} className="flex flex-col w-72 shrink-0">
                {/* 컬럼 헤더 */}
                <div className={clsx('flex items-center gap-2 px-3 py-2 rounded-xl mb-3', col.bg)}>
                  <span className={clsx('text-sm font-semibold', col.color)}>{col.label}</span>
                  <span className={clsx('text-xs font-bold px-1.5 py-0.5 rounded-full', col.color, col.bg)}>
                    {cards.length}
                  </span>
                </div>

                {/* 카드 목록 */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {loading ? (
                    <div className="flex items-center justify-center py-10 text-gray-300">
                      <Loader2 size={20} className="animate-spin" />
                    </div>
                  ) : cards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-gray-300 gap-2">
                      <Briefcase size={24} />
                      <span className="text-xs">캠페인 없음</span>
                    </div>
                  ) : (
                    cards.map(c => (
                      <CampaignCard
                        key={c.id}
                        campaign={c}
                        onClick={() => router.push(`/campaigns/${c.id}`)}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showModal && (
        <NewCampaignModal
          token={token}
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}
