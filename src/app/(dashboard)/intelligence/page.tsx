'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getRecentBriefs } from '@/lib/services/marketBriefs'
import { MarketBrief } from '@/types'
import {
  Globe, RefreshCw, Loader2, ExternalLink, ChevronDown, ChevronUp,
  Sparkles, Calendar, Search,
} from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

// ── 경쟁사 언급/활동 섹션 ────────────────────────────────────
function CompetitorPRSection({ brief }: { brief: MarketBrief }) {
  if (!brief.competitorPR || brief.competitorPR.length === 0) return null

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Search size={13} className="text-violet-400" />
        <span className="text-sm font-semibold text-gray-800">경쟁사 언급/활동 현황</span>
        {brief.searchDate && (
          <span className="ml-1 text-xs text-gray-400">({brief.searchDate} 기준)</span>
        )}
      </div>
      <div className="space-y-3">
        {brief.competitorPR.map((comp) => (
          <div
            key={comp.brand}
            className={clsx(
              'rounded-xl border p-3',
              comp.found ? 'border-violet-100 bg-violet-50/30' : 'border-gray-100 bg-gray-50/30'
            )}
          >
            {/* 헤더 */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold text-gray-800">{comp.brand}</span>
              <span
                className={clsx(
                  'px-1.5 py-0.5 rounded-full text-xs font-medium',
                  comp.found
                    ? 'bg-violet-100 text-violet-600'
                    : 'bg-gray-100 text-gray-400'
                )}
              >
                {comp.found ? '언급 확인' : '미확인'}
              </span>
            </div>
            {/* 요약 */}
            <p className="text-xs text-gray-500 leading-snug mb-2">{comp.summary}</p>
            {/* 링크 버튼 목록 */}
            {comp.links && comp.links.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {comp.links.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 group bg-white border border-violet-100 hover:border-violet-300 hover:bg-violet-50 rounded-lg px-3 py-2 transition-colors"
                  >
                    <ExternalLink
                      size={12}
                      className="text-violet-300 group-hover:text-violet-500 shrink-0 mt-0.5"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700 group-hover:text-violet-700 leading-snug truncate">
                        {link.title}
                      </p>
                      {link.snippet && (
                        <p className="text-xs text-gray-400 leading-snug mt-0.5 line-clamp-2">
                          {link.snippet}
                        </p>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-300 italic">관련 링크 없음</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 브리프 카드 ───────────────────────────────────────────────
function BriefCard({ brief, isLatest }: { brief: MarketBrief; isLatest: boolean }) {
  const [showSources, setShowSources] = useState(false)

  return (
    <div
      className={clsx(
        'bg-white border rounded-2xl overflow-hidden transition-all',
        isLatest ? 'border-indigo-200 shadow-sm' : 'border-gray-200'
      )}
    >
      {/* 날짜 헤더 */}
      <div
        className={clsx(
          'flex items-center gap-2 px-5 py-3 border-b',
          isLatest
            ? 'bg-indigo-50 border-indigo-100'
            : 'bg-gray-50/60 border-gray-100'
        )}
      >
        <Calendar size={13} className={isLatest ? 'text-indigo-400' : 'text-gray-400'} />
        <span
          className={clsx(
            'text-sm font-semibold',
            isLatest ? 'text-indigo-700' : 'text-gray-600'
          )}
        >
          {brief.date}
        </span>
        {brief.searchDate && brief.searchDate !== brief.date && (
          <span className="text-xs text-gray-400">
            ({brief.searchDate} 기준)
          </span>
        )}
        {isLatest && (
          <span className="ml-1 px-2 py-0.5 text-xs bg-indigo-500 text-white rounded-full font-medium">
            최신
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {format(brief.createdAt, 'HH:mm 생성', { locale: ko })}
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* 요약 */}
        <p className="text-sm text-gray-700 leading-relaxed">{brief.summary}</p>

        {/* 토픽 리스트 */}
        {brief.topics.length > 0 && (
          <div className="space-y-3">
            {brief.topics.map((topic, i) => (
              <div key={i} className="flex gap-3">
                <span
                  className={clsx(
                    'shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5',
                    isLatest
                      ? 'bg-indigo-100 text-indigo-600'
                      : 'bg-gray-100 text-gray-500'
                  )}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 mb-0.5">{topic.title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{topic.description}</p>
                  {topic.source && (
                    <p className="text-xs text-gray-400 mt-0.5 italic">출처: {topic.source}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 경쟁사 PR 현황 */}
        <CompetitorPRSection brief={brief} />

        {/* 출처 (접기/펼치기) */}
        {brief.sources.length > 0 && (
          <div>
            <button
              onClick={() => setShowSources((v) => !v)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showSources ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              검색 출처 {brief.sources.length}개
            </button>
            {showSources && (
              <div className="mt-2 space-y-1.5">
                {brief.sources.map((src, i) => (
                  <a
                    key={i}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-1.5 group"
                  >
                    <ExternalLink
                      size={11}
                      className="text-gray-300 group-hover:text-blue-400 mt-0.5 shrink-0"
                    />
                    <span className="text-xs text-gray-400 group-hover:text-blue-500 leading-snug truncate">
                      {src.title}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────
export default function IntelligencePage() {
  const { user } = useAuth()
  const [briefs, setBriefs] = useState<MarketBrief[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const loadBriefs = async () => {
    setLoading(true)
    try {
      const data = await getRecentBriefs(14)
      setBriefs(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) loadBriefs()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const handleGenerate = async () => {
    if (!user) return
    setGenerating(true)
    setGenError(null)
    try {
      const res = await fetch('/api/cron/daily-digest', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.uid}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '브리핑 생성 실패')
      // 새 브리핑 로드
      await loadBriefs()
    } catch (err) {
      setGenError(err instanceof Error ? err.message : '브리핑 생성 실패')
    } finally {
      setGenerating(false)
    }
  }

  // 오늘 이미 브리핑이 있는지 확인
  const today = new Date().toISOString().slice(0, 10)
  const hasTodayBrief = briefs.some((b) => b.date === today)

  return (
    <div className="h-full overflow-y-auto bg-gray-50/40">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Globe size={20} className="text-indigo-500" />
              일본 시장 인텔리전스
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Tavily + AI로 수집한 일본 SNS 트렌드 일일 브리핑
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!hasTodayBrief && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white text-sm rounded-xl hover:bg-indigo-600 disabled:opacity-50 transition-colors"
              >
                {generating ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                {generating ? '생성 중...' : '브리핑 생성'}
              </button>
            )}
            <button
              onClick={loadBriefs}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>
          </div>
        </div>

        {/* 오류 */}
        {genError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
            {genError}
          </div>
        )}

        {/* 오늘 이미 있을 때 메시지 */}
        {hasTodayBrief && !loading && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-green-700">오늘 브리핑이 이미 생성되었습니다.</p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 disabled:opacity-50"
            >
              {generating ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              재생성
            </button>
          </div>
        )}

        {/* 안내 (Tavily 없을 때) */}
        {!process.env.NEXT_PUBLIC_HAS_TAVILY && briefs.length === 0 && !loading && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-sm text-amber-700 font-medium mb-1">설정 필요</p>
            <p className="text-xs text-amber-600">
              브리핑 생성에는 <code className="bg-amber-100 px-1 rounded">TAVILY_API_KEY</code>와{' '}
              <code className="bg-amber-100 px-1 rounded">OPENAI_API_KEY</code> 환경변수가
              필요합니다.
            </p>
          </div>
        )}

        {/* 브리핑 목록 */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-300">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : briefs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-300">
            <Globe size={36} />
            <div className="text-center">
              <p className="text-sm text-gray-400 font-medium">아직 브리핑이 없습니다.</p>
              <p className="text-sm text-gray-400">
                &apos;브리핑 생성&apos; 버튼을 눌러 첫 번째 일본 시장 브리핑을 만들어보세요.
              </p>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white text-sm rounded-xl hover:bg-indigo-600 disabled:opacity-50 mt-2"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {generating ? '생성 중...' : '첫 브리핑 생성'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {briefs.map((brief, i) => (
              <BriefCard key={brief.id} brief={brief} isLatest={i === 0} />
            ))}
            <p className="text-xs text-center text-gray-300 py-2">
              최근 14일 브리핑 · 30일 후 자동 삭제
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
