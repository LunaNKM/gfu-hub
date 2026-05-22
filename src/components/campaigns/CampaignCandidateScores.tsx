'use client'

import React, { useEffect, useState } from 'react'
import { InfluencerScore } from '@/types'
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldAlert, Star } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

function scoreColor(score: number) {
  if (score >= 80) return 'text-green-600 bg-green-50'
  if (score >= 65) return 'text-blue-600 bg-blue-50'
  if (score >= 45) return 'text-amber-600 bg-amber-50'
  return 'text-red-600 bg-red-50'
}

export function CampaignCandidateScores({ campaignId }: { campaignId: string }) {
  const { user } = useAuth()
  const [scores, setScores] = useState<InfluencerScore[]>([])
  const [loading, setLoading] = useState(true)
  const [recalculating, setRecalculating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  const load = async () => {
    if (!user) return
    setLoading(true)
    setMessage(null)
    try {
      const token = await user.getIdToken()
      const res = await fetch(`/api/campaigns/${campaignId}/influencer-scores`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '점수를 불러올 수 없습니다.')
      setScores(data.scores ?? [])
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '점수를 불러올 수 없습니다.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, user])

  const recalc = async () => {
    if (!user) {
      setMessage({ type: 'error', text: '로그인 정보를 확인할 수 없습니다. 새로고침 후 다시 시도하세요.' })
      return
    }
    setRecalculating(true)
    setMessage({ type: 'info', text: '인플루언서 CRM 데이터를 불러와 점수를 계산하고 있습니다.' })
    try {
      const token = await user.getIdToken()
      const res = await fetch(`/api/campaigns/${campaignId}/influencer-scores`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '점수를 계산할 수 없습니다.')
      setScores(data.scores ?? [])
      setMessage({
        type: data.scores?.length > 0 ? 'success' : 'info',
        text: data.message ?? `${data.scores?.length ?? 0}명의 후보 점수를 계산했습니다.`,
      })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '점수를 계산할 수 없습니다.' })
    } finally {
      setRecalculating(false)
      setLoading(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">인플루언서 후보 점수</h2>
          <p className="text-xs text-gray-400 mt-0.5">ER, CPV, 팔로워, 과거 성과, 적합도, 리스크 기반 추천</p>
        </div>
        <button
          onClick={recalc}
          disabled={recalculating}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500 text-white text-sm rounded-lg disabled:opacity-50"
        >
          {recalculating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          점수 재계산
        </button>
      </div>

      {message && (
        <div className={`flex items-start gap-2 rounded-xl px-3 py-2 mb-4 text-sm ${
          message.type === 'error'
            ? 'bg-red-50 text-red-700 border border-red-100'
            : message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-100'
              : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
        }`}>
          {message.type === 'error' ? <AlertCircle size={15} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12 text-gray-300"><Loader2 size={20} className="animate-spin" /></div>
      ) : scores.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Star size={28} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm">점수화할 인플루언서 데이터가 아직 없습니다.</p>
          <p className="text-xs text-gray-300 mt-1">캠페인 Sheets를 동기화하거나 인플루언서 CRM에 데이터가 쌓인 뒤 다시 실행하세요.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {scores.slice(0, 30).map((score) => (
            <div key={score.id} className="border border-gray-100 rounded-xl p-3 hover:border-indigo-200 transition-colors">
              <div className="flex items-start gap-3">
                <span className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold ${scoreColor(score.totalScore)}`}>
                  {score.totalScore}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{score.handle}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{score.platform || '기타'}</span>
                    {score.expectedViews && <span className="text-xs text-gray-400">예상 조회 {score.expectedViews.toLocaleString()}</span>}
                  </div>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-2">
                    {[
                      ['ER', score.erScore],
                      ['CPV', score.cpvScore],
                      ['팔로워', score.followerScore],
                      ['이력', score.historyScore],
                      ['브랜드', score.brandFitScore],
                      ['플랫폼', score.platformFitScore],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-gray-50 rounded-lg px-2 py-1">
                        <p className="text-[11px] text-gray-400">{label}</p>
                        <p className="text-xs font-semibold text-gray-700">{value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{score.reasons.slice(0, 3).join(' · ')}</p>
                  {score.risks.length > 0 && (
                    <p className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                      <ShieldAlert size={12} />
                      {score.risks.join(' · ')}
                    </p>
                  )}
                </div>
                <a
                  href={`/influencers?q=${encodeURIComponent(score.handle)}`}
                  className="text-gray-300 hover:text-blue-500"
                  title="CRM에서 보기"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
