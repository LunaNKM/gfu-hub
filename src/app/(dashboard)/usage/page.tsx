'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getMyUsage, getUsageStats } from '@/lib/services/usage'
import { AiUsageLog } from '@/types'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Zap, MessageSquare, FileText, Sparkles, Database } from 'lucide-react'

const FEATURE_LABELS: Record<string, string> = {
  chat: 'AI 채팅',
  prompt_optimizer: '프롬프트 최적화',
  rag: 'RAG 검색',
  embedding: '임베딩',
}

const FEATURE_ICONS: Record<string, React.ReactNode> = {
  chat: <MessageSquare size={16} />,
  prompt_optimizer: <Sparkles size={16} />,
  rag: <Database size={16} />,
  embedding: <FileText size={16} />,
}

export default function UsagePage() {
  const { user } = useAuth()
  const [logs, setLogs] = useState<AiUsageLog[]>([])
  const [stats, setStats] = useState<{
    totalRequests: number
    totalTokens: number
    byFeature: Record<string, number>
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      Promise.all([getMyUsage(user.uid), getUsageStats(user.uid)]).then(([logsData, statsData]) => {
        setLogs(logsData)
        setStats(statsData)
        setLoading(false)
      })
    }
  }, [user])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">AI 사용량</h1>
        <p className="text-sm text-gray-500 mt-0.5">나의 AI 사용 현황을 확인하세요</p>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Zap size={20} className="text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalRequests ?? 0}</p>
              <p className="text-xs text-gray-500">전체 요청 수</p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
              <MessageSquare size={20} className="text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {(stats?.totalTokens ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">전체 토큰 수</p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
              <Sparkles size={20} className="text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {stats?.totalRequests
                  ? Math.round((stats.totalTokens / stats.totalRequests)).toLocaleString()
                  : 0}
              </p>
              <p className="text-xs text-gray-500">평균 토큰/요청</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 기능별 사용량 */}
      {stats && Object.keys(stats.byFeature).length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">기능별 사용량</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(stats.byFeature).map(([feature, count]) => (
              <Card key={feature} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-gray-500">
                    {FEATURE_ICONS[feature] || <Zap size={16} />}
                  </span>
                  <span className="text-xs text-gray-600">{FEATURE_LABELS[feature] || feature}</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{count}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 최근 로그 */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">최근 로그</h2>
        {logs.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-gray-400 text-sm">아직 AI 사용 기록이 없습니다</p>
          </Card>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">기능</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">모델</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">입력 토큰</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">출력 토큰</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">합계</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">상태</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">시간</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.slice(0, 50).map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-700">
                        {FEATURE_LABELS[log.feature] || log.feature}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">{log.model}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-700">
                      {log.inputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-700">
                      {log.outputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-medium text-gray-900">
                      {log.totalTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={log.success ? 'green' : 'red'}>
                        {log.success ? '성공' : '실패'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-400">
                        {format(log.createdAt, 'M.d HH:mm', { locale: ko })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
