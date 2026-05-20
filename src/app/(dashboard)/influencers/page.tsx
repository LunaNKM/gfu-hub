'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getInfluencers, searchInfluencers } from '@/lib/services/influencers'
import { Influencer } from '@/types'
import {
  Users, Search, ExternalLink, ChevronDown, ChevronUp,
  Instagram, RefreshCw, Loader2,
} from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

// ── 플랫폼 메타 ───────────────────────────────────────────────
const PLATFORMS = [
  { key: '', label: '전체' },
  { key: 'Instagram', label: 'Instagram' },
  { key: 'TikTok', label: 'TikTok' },
  { key: 'YouTube', label: 'YouTube' },
  { key: 'X', label: 'X' },
]

const PLATFORM_COLOR: Record<string, string> = {
  Instagram: 'bg-pink-50 text-pink-600 border-pink-200',
  TikTok:    'bg-gray-900 text-white border-gray-700',
  YouTube:   'bg-red-50 text-red-600 border-red-200',
  X:         'bg-gray-50 text-gray-700 border-gray-300',
}

const PLATFORM_SHORT: Record<string, string> = {
  Instagram: 'IG', TikTok: 'TK', YouTube: 'YT', X: 'X',
}

function PlatformBadge({ p }: { p: string }) {
  const cls = PLATFORM_COLOR[p]
  if (!cls) return <span className="text-xs text-gray-400">{p || '—'}</span>
  return (
    <span className={clsx('px-2 py-0.5 rounded text-xs font-bold border shrink-0', cls)}>
      {PLATFORM_SHORT[p] ?? p}
    </span>
  )
}

function fmtNum(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천`
  return n.toLocaleString()
}

// ── 인플루언서 카드 ──────────────────────────────────────────
function InfluencerRow({ influencer }: { influencer: Influencer }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-t border-gray-50 hover:bg-gray-50/40 transition-colors">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* 플랫폼 */}
        <div className="w-10 flex justify-center shrink-0">
          <PlatformBadge p={influencer.platform} />
        </div>

        {/* 계정명 */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{influencer.handle}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            마지막 캠페인: {format(influencer.lastSeenAt, 'yyyy.MM.dd', { locale: ko })}
          </p>
        </div>

        {/* 팔로워 */}
        <div className="text-right shrink-0 w-20">
          {influencer.followers > 0 ? (
            <p className="text-sm font-semibold text-gray-900">{fmtNum(influencer.followers)}</p>
          ) : (
            <p className="text-xs text-gray-300">—</p>
          )}
          <p className="text-xs text-gray-400">팔로워</p>
        </div>

        {/* 캠페인 수 */}
        <div className="text-right shrink-0 w-16">
          <p className="text-sm font-semibold text-indigo-600">{influencer.appearances.length}</p>
          <p className="text-xs text-gray-400">캠페인</p>
        </div>

        {/* URL */}
        <div className="shrink-0 w-8 flex justify-center">
          {influencer.profileUrl ? (
            <a
              href={influencer.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-gray-300 hover:text-blue-500 transition-colors"
            >
              <ExternalLink size={13} />
            </a>
          ) : (
            <span className="w-4" />
          )}
        </div>

        {/* 펼치기 */}
        <div className="shrink-0 text-gray-300">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* 캠페인 이력 펼침 */}
      {expanded && influencer.appearances.length > 0 && (
        <div className="px-4 pb-3 pt-0">
          <div className="ml-10 border-l-2 border-indigo-100 pl-4 space-y-2">
            {influencer.appearances
              .slice()
              .sort((a, b) => b.syncedAt.localeCompare(a.syncedAt))
              .map((ap, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">{ap.campaignName}</p>
                    <p className="text-xs text-gray-400">
                      {ap.clientName} · {ap.tabType} ·{' '}
                      {format(new Date(ap.syncedAt), 'yyyy.MM.dd', { locale: ko })}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────
export default function InfluencersPage() {
  const { user } = useAuth()
  const [influencers, setInfluencers] = useState<Influencer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQ, setSearchQ] = useState('')
  const [platform, setPlatform] = useState('')
  const [sortBy, setSortBy] = useState<'lastSeen' | 'followers' | 'appearances'>('lastSeen')

  const load = async () => {
    setLoading(true)
    try {
      const data = platform
        ? await searchInfluencers(platform)
        : await getInfluencers()
      setInfluencers(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, platform])

  const filtered = useMemo(() => {
    let list = influencers
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase()
      list = list.filter(
        (inf) =>
          inf.handle.toLowerCase().includes(q) ||
          inf.appearances.some((a) => a.campaignName.toLowerCase().includes(q))
      )
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'followers') return b.followers - a.followers
      if (sortBy === 'appearances') return b.appearances.length - a.appearances.length
      return b.lastSeenAt.getTime() - a.lastSeenAt.getTime()
    })
  }, [influencers, searchQ, sortBy])

  // 통계
  const stats = useMemo(() => {
    const byPlatform: Record<string, number> = {}
    influencers.forEach((inf) => {
      byPlatform[inf.platform || '기타'] = (byPlatform[inf.platform || '기타'] ?? 0) + 1
    })
    const withFollowers = influencers.filter((i) => i.followers > 0)
    const avgFollowers =
      withFollowers.length > 0
        ? Math.round(withFollowers.reduce((s, i) => s + i.followers, 0) / withFollowers.length)
        : 0
    return { total: influencers.length, byPlatform, avgFollowers }
  }, [influencers])

  return (
    <div className="h-full overflow-y-auto bg-gray-50/40">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">인플루언서 CRM</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              캠페인 Sheets에서 자동 수집된 인플루언서 데이터베이스
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            새로고침
          </button>
        </div>

        {/* 통계 카드 */}
        {!loading && influencers.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                <Users size={13} /><span className="text-xs">전체</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.total.toLocaleString()}</p>
            </div>
            {Object.entries(stats.byPlatform)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([plt, cnt]) => (
                <div key={plt} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <PlatformBadge p={plt} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{cnt.toLocaleString()}</p>
                </div>
              ))}
          </div>
        )}

        {/* 필터 */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
          {/* 검색 */}
          <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100 transition-all">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="계정명 또는 캠페인명으로 검색..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              className="flex-1 text-sm outline-none bg-transparent text-gray-900 placeholder:text-gray-400"
            />
          </div>

          {/* 플랫폼 탭 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 shrink-0">플랫폼</span>
            <div className="flex gap-1.5 flex-wrap">
              {PLATFORMS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPlatform(p.key)}
                  className={clsx(
                    'px-3 py-1 text-xs rounded-full border transition-colors',
                    platform === p.key
                      ? 'bg-indigo-500 text-white border-indigo-500'
                      : 'border-gray-200 text-gray-500 hover:border-indigo-300'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-xs text-gray-400">정렬</span>
              {(
                [
                  ['lastSeen', '최근 캠페인'],
                  ['followers', '팔로워'],
                  ['appearances', '캠페인 수'],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setSortBy(k)}
                  className={clsx(
                    'px-2.5 py-1 text-xs rounded-full border transition-colors',
                    sortBy === k
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'border-gray-200 text-gray-400'
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 리스트 */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {/* 테이블 헤더 */}
          <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50/80 border-b border-gray-100">
            <div className="w-10 text-xs text-gray-400 font-medium">플랫폼</div>
            <div className="flex-1 text-xs text-gray-400 font-medium">계정</div>
            <div className="w-20 text-right text-xs text-gray-400 font-medium">팔로워</div>
            <div className="w-16 text-right text-xs text-gray-400 font-medium">캠페인</div>
            <div className="w-8" />
            <div className="w-5" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-300">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-300">
              <Users size={32} />
              <div className="text-center">
                {influencers.length === 0 ? (
                  <>
                    <p className="text-sm text-gray-400">아직 인플루언서 데이터가 없습니다.</p>
                    <p className="text-sm text-gray-400">
                      캠페인에서 Google Sheets를 동기화하면 자동으로 수집됩니다.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">검색 결과가 없습니다.</p>
                )}
              </div>
            </div>
          ) : (
            <>
              {filtered.map((inf) => (
                <InfluencerRow key={inf.id} influencer={inf} />
              ))}
              <div className="px-4 py-2.5 border-t border-gray-50 bg-gray-50/30">
                <p className="text-xs text-gray-400">
                  {filtered.length.toLocaleString()}명 표시 중
                  {filtered.length !== influencers.length &&
                    ` (전체 ${influencers.length.toLocaleString()}명)`}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
