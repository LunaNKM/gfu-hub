'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Campaign, CampaignStatus } from '@/types'
import { useRouter } from 'next/navigation'
import { Plus, Briefcase, Calendar, CircleDollarSign, X, Loader2, ListPlus } from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

// ── 상수 ─────────────────────────────────────────────────────────
const COLUMNS: { status: CampaignStatus; label: string; color: string; bg: string }[] = [
  { status: 'proposal', label: '제안',    color: 'text-amber-600', bg: 'bg-amber-50'  },
  { status: 'active',   label: '진행 중', color: 'text-blue-600',  bg: 'bg-blue-50'   },
  { status: 'completed',label: '완료',    color: 'text-green-600', bg: 'bg-green-50'  },
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
interface ModalProps {
  onClose: () => void
  onCreated: () => void
  token: string
}

function NewCampaignModal({ onClose, onCreated, token }: ModalProps) {
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

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
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

// ── 일괄 추가 모달 ────────────────────────────────────────────────
interface ParsedEntry {
  name: string
  sheetsUrl: string
  clientName: string
}

type ItemStatus = 'pending' | 'creating' | 'syncing' | 'done' | 'error'

interface ProgressItem extends ParsedEntry {
  status: ItemStatus
  errorMsg?: string
}

// 캠페인명에서 클라이언트명 추출 (휴리스틱)
function extractClientName(name: string): string {
  // [브랜드] 패턴
  const bracket = name.match(/^\[(.+?)\]/)
  if (bracket) return bracket[1].trim()
  // 브랜드 | 캠페인명 패턴
  const pipe = name.match(/^(.+?)\s*\|\s*.+/)
  if (pipe) return pipe[1].trim()
  // 첫 단어
  return name.split(/[\s_]+/)[0]
}

// 붙여넣기 텍스트 파싱:
// 빈 줄로 구분된 블록, 각 블록의 첫 줄=캠페인명, 두 번째 줄=시트 URL(선택)
function parseImportText(raw: string): ParsedEntry[] {
  const blocks = raw.split(/\n[ \t]*\n/).map(b => b.trim()).filter(Boolean)
  const entries: ParsedEntry[] = []
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) continue
    const name = lines[0]
    if (name.startsWith('http')) continue          // URL-only 블록 무시
    const sheetsUrl =
      lines.length > 1 && lines[1].startsWith('http') ? lines[1] : ''
    entries.push({ name, sheetsUrl, clientName: extractClientName(name) })
  }
  return entries
}

function BulkImportModal({ onClose, onCreated, token }: ModalProps) {
  const [text, setText] = useState('')
  const [syncSheets, setSyncSheets] = useState(true)
  const [phase, setPhase] = useState<'input' | 'running' | 'done'>('input')
  const [items, setItems] = useState<ProgressItem[]>([])

  const parsed = useMemo(() => parseImportText(text), [text])

  const updateItem = (idx: number, patch: Partial<ProgressItem>) =>
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

  const handleStart = async () => {
    if (parsed.length === 0) return
    setItems(parsed.map(e => ({ ...e, status: 'pending' })))
    setPhase('running')

    for (let i = 0; i < parsed.length; i++) {
      const { name, sheetsUrl, clientName } = parsed[i]
      try {
        updateItem(i, { status: 'creating' })
        const res = await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            clientName,
            campaignName: name,
            status: 'proposal',
            startDate: '',
            endDate: '',
            budget: 0,
            memo: '',
          }),
        })
        if (!res.ok) throw new Error('캠페인 생성 실패')
        const { id } = await res.json()

        if (syncSheets && sheetsUrl && id) {
          updateItem(i, { status: 'syncing' })
          try {
            await fetch(`/api/campaigns/${id}/sheets`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ sheetsUrl }),
            })
          } catch {
            // 시트 동기화 실패는 non-fatal
          }
        }

        updateItem(i, { status: 'done' })
      } catch (err) {
        updateItem(i, { status: 'error', errorMsg: err instanceof Error ? err.message : '오류' })
      }
    }

    setPhase('done')
  }

  const doneCount  = items.filter(i => i.status === 'done').length
  const errorCount = items.filter(i => i.status === 'error').length
  const processedCount = items.filter(
    i => i.status === 'done' || i.status === 'error'
  ).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">캠페인 일괄 추가</h2>
          {phase !== 'running' && (
            <button
              onClick={phase === 'done' ? onCreated : onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* 바디 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {phase === 'input' && (
            <>
              {/* 안내 */}
              <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                <p className="text-xs font-medium text-gray-600">입력 형식 — 빈 줄로 구분</p>
                <pre className="text-xs text-gray-400 leading-relaxed font-mono whitespace-pre">{`캠페인 이름
https://docs.google.com/spreadsheets/d/...

캠페인 이름 2
https://docs.google.com/spreadsheets/d/...`}</pre>
                <p className="text-xs text-gray-400">시트 링크가 없으면 이름만 적어도 됩니다.</p>
              </div>

              {/* 텍스트 입력 */}
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={9}
                placeholder={`캠페인 이름\nhttps://docs.google.com/spreadsheets/d/...\n\n캠페인 이름 2\nhttps://docs.google.com/spreadsheets/d/...`}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 resize-none font-mono"
              />

              {/* 미리보기 */}
              {parsed.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    {parsed.length}개 캠페인 감지됨
                  </p>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {parsed.map((e, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2"
                      >
                        <span className="text-gray-400 shrink-0 w-5 text-right">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate">{e.name}</p>
                          <p className="text-gray-400 truncate">클라이언트: {e.clientName}</p>
                        </div>
                        {e.sheetsUrl ? (
                          <span className="shrink-0 text-emerald-500 font-medium">시트 ✓</span>
                        ) : (
                          <span className="shrink-0 text-gray-300">시트 없음</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 시트 동기화 옵션 */}
              {parsed.some(e => e.sheetsUrl) && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={syncSheets}
                    onChange={e => setSyncSheets(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400 accent-blue-500"
                  />
                  <span className="text-sm text-gray-700">시트 자동 동기화 포함</span>
                  <span className="text-xs text-gray-400">(캠페인당 수십 초 소요)</span>
                </label>
              )}
            </>
          )}

          {/* 진행 상황 */}
          {(phase === 'running' || phase === 'done') && (
            <>
              {phase === 'done' && (
                <div className={clsx(
                  'rounded-xl px-4 py-3 text-sm font-medium',
                  errorCount === 0
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                )}>
                  {doneCount}개 등록 완료
                  {errorCount > 0 && ` · ${errorCount}개 실패`}
                </div>
              )}

              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {/* 상태 아이콘 */}
                    <div className="w-5 shrink-0 flex justify-center">
                      {item.status === 'pending'  && <div className="w-2 h-2 rounded-full bg-gray-200" />}
                      {item.status === 'creating' && <Loader2 size={14} className="animate-spin text-blue-400" />}
                      {item.status === 'syncing'  && <Loader2 size={14} className="animate-spin text-indigo-400" />}
                      {item.status === 'done'     && <span className="text-emerald-500 text-sm font-bold">✓</span>}
                      {item.status === 'error'    && <span className="text-red-400 text-sm font-bold">✗</span>}
                    </div>

                    {/* 내용 */}
                    <div className="flex-1 min-w-0">
                      <p className={clsx(
                        'text-sm truncate',
                        item.status === 'error' ? 'text-red-500' : 'text-gray-800'
                      )}>
                        {item.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {item.status === 'pending'  && '대기 중'}
                        {item.status === 'creating' && '캠페인 생성 중...'}
                        {item.status === 'syncing'  && '시트 동기화 중...'}
                        {item.status === 'done' && (item.sheetsUrl && syncSheets ? '시트 포함 완료' : '완료')}
                        {item.status === 'error' && (item.errorMsg ?? '오류')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
          {phase === 'input' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleStart}
                disabled={parsed.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 transition-colors"
              >
                <ListPlus size={15} />
                {parsed.length > 0 ? `${parsed.length}개 일괄 등록` : '일괄 등록'}
              </button>
            </>
          )}
          {phase === 'running' && (
            <p className="text-sm text-gray-400 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              처리 중… ({processedCount}/{items.length})
            </p>
          )}
          {phase === 'done' && (
            <button
              onClick={onCreated}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              닫기
            </button>
          )}
        </div>
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
  const [showModal, setShowModal]     = useState(false)
  const [showBulk, setShowBulk]       = useState(false)

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulk(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ListPlus size={15} />
            일괄 추가
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Plus size={15} />
            새 캠페인
          </button>
        </div>
      </div>

      {/* 칸반 보드 */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-6 h-full min-w-[700px]">
          {COLUMNS.map(col => {
            const cards = byCols(col.status)
            return (
              <div key={col.status} className="flex flex-col w-72 shrink-0">
                <div className={clsx('flex items-center gap-2 px-3 py-2 rounded-xl mb-3', col.bg)}>
                  <span className={clsx('text-sm font-semibold', col.color)}>{col.label}</span>
                  <span className={clsx('text-xs font-bold px-1.5 py-0.5 rounded-full', col.color, col.bg)}>
                    {cards.length}
                  </span>
                </div>

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

      {showBulk && (
        <BulkImportModal
          token={token}
          onClose={() => setShowBulk(false)}
          onCreated={() => { setShowBulk(false); load() }}
        />
      )}
    </div>
  )
}
