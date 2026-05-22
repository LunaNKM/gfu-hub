'use client'

import React, { useEffect, useState } from 'react'
import { AiActionRun, AiActionType } from '@/types'
import { Bot, FileText, Loader2, ShieldCheck, Sparkles, Wand2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

const ACTIONS: { type: AiActionType; label: string; desc: string; icon: React.ReactNode }[] = [
  { type: 'recommend_influencers', label: '후보 추천', desc: '점수 기반 추천 우선순위 생성', icon: <Sparkles size={15} /> },
  { type: 'draft_proposal', label: '제안서 초안', desc: '캠페인 제안서 마크다운 생성', icon: <FileText size={15} /> },
  { type: 'review_content', label: '콘텐츠 검수', desc: '초안/캡션 리스크 검토', icon: <Wand2 size={15} /> },
  { type: 'generate_report_insights', label: '리포트 인사이트', desc: '성과 요약과 다음 액션 작성', icon: <Bot size={15} /> },
  { type: 'check_japanese_pr_compliance', label: '일본 PR 문구 체크', desc: '#PR/#広告 및 景品表示法 점검', icon: <ShieldCheck size={15} /> },
]

export function CampaignAiActions({ campaignId }: { campaignId: string }) {
  const { user } = useAuth()
  const [runs, setRuns] = useState<AiActionRun[]>([])
  const [running, setRunning] = useState<AiActionType | null>(null)
  const [content, setContent] = useState('')

  const load = async () => {
    const token = await user?.getIdToken()
    const res = await fetch(`/api/ai-actions?campaignId=${campaignId}`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    })
    const data = await res.json()
    setRuns(data.runs ?? [])
  }

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  const run = async (type: AiActionType) => {
    setRunning(type)
    try {
      const token = await user?.getIdToken()
      const res = await fetch('/api/ai-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({
          type,
          campaignId,
          input: {
            content,
          },
        }),
      })
      const data = await res.json()
      if (data.id) await load()
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">AI 업무 실행</h2>
        <p className="text-xs text-gray-400 mt-0.5">채팅이 아니라 캠페인 업무 단위로 AI를 실행합니다.</p>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="콘텐츠 초안, PR 문구, 리포트에 반영할 메모를 입력하세요. 후보 추천/제안서 생성은 비워둬도 실행됩니다."
        className="w-full min-h-24 text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-blue-400 resize-vertical"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {ACTIONS.map((action) => (
          <button
            key={action.type}
            onClick={() => run(action.type)}
            disabled={running !== null}
            className="text-left border border-gray-200 rounded-xl p-3 hover:border-blue-300 hover:bg-blue-50/30 disabled:opacity-50 transition-colors"
          >
            <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
              {running === action.type ? <Loader2 size={15} className="animate-spin" /> : action.icon}
              {action.label}
            </div>
            <p className="text-xs text-gray-400 mt-1 leading-snug">{action.desc}</p>
          </button>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-4">
        <h3 className="text-xs font-semibold text-gray-500 mb-2">최근 실행 기록</h3>
        {runs.length === 0 ? (
          <p className="text-sm text-gray-300 py-4">아직 실행 기록이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {runs.slice(0, 5).map((runItem) => (
              <details key={runItem.id} className="border border-gray-100 rounded-xl p-3">
                <summary className="cursor-pointer text-sm font-medium text-gray-800">
                  {ACTIONS.find((a) => a.type === runItem.type)?.label ?? runItem.type}
                  <span className="ml-2 text-xs text-gray-400">{runItem.status}</span>
                </summary>
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs bg-gray-50 rounded-lg p-3 text-gray-700">
                  {JSON.stringify(runItem.output, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
