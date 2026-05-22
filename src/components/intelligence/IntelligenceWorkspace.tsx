'use client'

import React, { useEffect, useState } from 'react'
import { BrandImpact, CompetitorWatch, TrendSignal, WeeklyMarketReport } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { Loader2, Plus, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'

type Tab = 'trends' | 'impacts' | 'competitors' | 'weekly'

export function IntelligenceWorkspace() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('trends')
  const [trends, setTrends] = useState<TrendSignal[]>([])
  const [impacts, setImpacts] = useState<BrandImpact[]>([])
  const [competitors, setCompetitors] = useState<CompetitorWatch[]>([])
  const [reports, setReports] = useState<WeeklyMarketReport[]>([])
  const [loading, setLoading] = useState(false)
  const [competitorForm, setCompetitorForm] = useState({ brandName: '', competitorName: '', keywords: '' })

  const token = async () => user?.getIdToken()

  const load = async () => {
    if (!user) return
    setLoading(true)
    try {
      const t = await token()
      const [trendRes, impactRes, competitorRes, reportRes] = await Promise.all([
        fetch('/api/intelligence/trends', { headers: { Authorization: `Bearer ${t}` } }),
        fetch('/api/intelligence/brand-impacts', { headers: { Authorization: `Bearer ${t}` } }),
        fetch('/api/intelligence/competitors', { headers: { Authorization: `Bearer ${t}` } }),
        fetch('/api/intelligence/weekly-reports', { headers: { Authorization: `Bearer ${t}` } }),
      ])
      setTrends((await trendRes.json()).signals ?? [])
      setImpacts((await impactRes.json()).impacts ?? [])
      setCompetitors((await competitorRes.json()).watches ?? [])
      setReports((await reportRes.json()).reports ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const createCompetitor = async () => {
    if (!competitorForm.brandName.trim() || !competitorForm.competitorName.trim()) return
    const t = await token()
    await fetch('/api/intelligence/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        brandName: competitorForm.brandName.trim(),
        competitorName: competitorForm.competitorName.trim(),
        keywords: competitorForm.keywords.split(',').map((v) => v.trim()).filter(Boolean),
        platforms: ['Instagram', 'TikTok', 'YouTube', 'X'],
      }),
    })
    setCompetitorForm({ brandName: '', competitorName: '', keywords: '' })
    await load()
  }

  const createWeeklyReport = async () => {
    const t = await token()
    await fetch('/api/intelligence/weekly-reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}` },
    })
    await load()
    setTab('weekly')
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
        <div className="flex gap-1 overflow-x-auto">
          {([
            ['trends', '저장한 트렌드'],
            ['impacts', '브랜드 영향도'],
            ['competitors', '경쟁사 모니터링'],
            ['weekly', '주간 리포트'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap',
                tab === key ? 'bg-indigo-500 text-white' : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={load} disabled={loading} className="text-gray-400 hover:text-gray-600">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </div>

      <div className="p-5">
        {tab === 'trends' && (
          <div className="space-y-3">
            {trends.length === 0 ? (
              <p className="text-sm text-gray-300 py-8 text-center">저장한 트렌드가 없습니다. 일일 브리핑에서 저장하세요.</p>
            ) : trends.map((trend) => (
              <div key={trend.id} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{trend.title}</p>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{trend.summary}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-600">영향 {trend.impactScore}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {trend.platforms.map((p) => <span key={p} className="text-xs bg-gray-100 text-gray-500 rounded px-2 py-0.5">{p}</span>)}
                  {trend.relatedBrands.map((b) => <span key={b} className="text-xs bg-blue-50 text-blue-600 rounded px-2 py-0.5">{b}</span>)}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'impacts' && (
          <div className="space-y-3">
            {impacts.length === 0 ? (
              <p className="text-sm text-gray-300 py-8 text-center">브랜드 영향도 데이터가 없습니다.</p>
            ) : impacts.map((impact) => (
              <div key={impact.id} className="grid md:grid-cols-[140px_1fr] gap-3 border border-gray-100 rounded-xl p-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{impact.brandName}</p>
                  <p className="text-xs text-indigo-500">관련도 {impact.relevanceScore}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-green-600">기회: {impact.opportunity || '-'}</p>
                  <p className="text-xs text-amber-600">리스크: {impact.risk || '-'}</p>
                  <p className="text-xs text-gray-600">액션: {impact.suggestedAction || '-'}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'competitors' && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-[1fr_1fr_1fr_auto] gap-2">
              <input value={competitorForm.brandName} onChange={(e) => setCompetitorForm((p) => ({ ...p, brandName: e.target.value }))}
                placeholder="우리 브랜드" className="text-sm border border-gray-200 rounded-lg px-3 py-2" />
              <input value={competitorForm.competitorName} onChange={(e) => setCompetitorForm((p) => ({ ...p, competitorName: e.target.value }))}
                placeholder="경쟁사" className="text-sm border border-gray-200 rounded-lg px-3 py-2" />
              <input value={competitorForm.keywords} onChange={(e) => setCompetitorForm((p) => ({ ...p, keywords: e.target.value }))}
                placeholder="키워드, 쉼표 구분" className="text-sm border border-gray-200 rounded-lg px-3 py-2" />
              <button onClick={createCompetitor} className="flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-500 text-white text-sm rounded-lg">
                <Plus size={14} />추가
              </button>
            </div>
            {competitors.map((watch) => (
              <div key={watch.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-xl p-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{watch.brandName} vs {watch.competitorName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{watch.keywords.join(', ') || '키워드 없음'}</p>
                </div>
                <span className={clsx('text-xs px-2 py-1 rounded-full', watch.active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400')}>
                  {watch.active ? '활성' : '중지'}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'weekly' && (
          <div className="space-y-3">
            <button onClick={createWeeklyReport} className="px-3 py-2 bg-indigo-500 text-white text-sm rounded-lg">
              이번 주 리포트 생성
            </button>
            {reports.length === 0 ? (
              <p className="text-sm text-gray-300 py-8 text-center">주간 리포트가 없습니다.</p>
            ) : reports.map((report) => (
              <div key={report.id} className="border border-gray-100 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-900">{report.weekStart} ~ {report.weekEnd}</p>
                <p className="text-xs text-gray-500 mt-1">{report.summary}</p>
                <div className="mt-3 grid md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">핵심 트렌드</p>
                    <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                      {report.keyTrends.map((trend) => <li key={trend}>{trend}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">추천 액션</p>
                    <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                      {report.recommendedActions.map((action) => <li key={action}>{action}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

