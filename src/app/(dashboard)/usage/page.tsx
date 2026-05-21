'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getMyUsage, computeStats, formatUsd } from '@/lib/services/usage'
import { AiUsageLog } from '@/types'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  DollarSign,
  MessageSquare,
  TrendingUp,
  Calendar,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { clsx } from 'clsx'

const FEATURE_LABELS: Record<string, string> = {
  chat: 'AI 채팅',
  prompt_optimizer: '프롬프트 최적화',
  rag: 'RAG 검색',
  embedding: '임베딩',
  memory: '장기 기억',
}

type Tab = 'my' | 'company'

interface CompanyStats {
  totalRequests: number
  totalCostUsd: number
  thisMonthCostUsd: number
  activeUsers: number
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  color = 'blue',
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  color?: 'blue' | 'green' | 'purple' | 'orange'
}) {
  const bg: Record<string, string> = {
    blue: 'bg-blue-50', green: 'bg-green-50', purple: 'bg-purple-50', orange: 'bg-orange-50',
  }
  const text: Record<string, string> = {
    blue: 'text-blue-500', green: 'text-green-500', purple: 'text-purple-500', orange: 'text-orange-500',
  }
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', bg[color])}>
          <span className={text[color]}>{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-gray-900 truncate">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  )
}

function LogTable({ logs }: { logs: AiUsageLog[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? logs : logs.slice(0, 30)

  if (logs.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-gray-400 text-sm">아직 AI 사용 기록이 없습니다</p>
      </Card>
    )
  }

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">기능</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">모델</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">입력</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">출력</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-green-600">비용</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">상태</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">시간</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-xs text-gray-700">
                  {FEATURE_LABELS[log.feature] || log.feature}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{log.model}</td>
                <td className="px-4 py-3 text-right text-xs text-gray-600">
                  {log.inputTokens.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-xs text-gray-600">
                  {log.outputTokens.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-green-600">
                  {formatUsd(log.costUsd ?? 0)}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={log.success ? 'green' : 'red'}>
                    {log.success ? '성공' : '실패'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {format(log.createdAt, 'M.d HH:mm', { locale: ko })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {logs.length > 30 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 w-full flex items-center justify-center gap-1 py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          {expanded
            ? <><ChevronUp size={14} /> 접기</>
            : <><ChevronDown size={14} /> 전체 {logs.length}건 보기</>}
        </button>
      )}
    </div>
  )
}

export default function UsagePage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('my')
  const [myLogs, setMyLogs] = useState<AiUsageLog[]>([])
  const [companyStats, setCompanyStats] = useState<CompanyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [companyLoading, setCompanyLoading] = useState(false)

  // 내 사용량 로드
  useEffect(() => {
    if (!user) return
    getMyUsage(user.uid).then((data) => {
      setMyLogs(data)
      setLoading(false)
    })
  }, [user])

  // 회사 통계는 탭 클릭 시 로드
  useEffect(() => {
    if (tab !== 'company' || companyStats || !user) return
    setCompanyLoading(true)
    user.getIdToken().then((token) =>
      fetch('/api/usage/company-stats', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).then((r) => r.json())
      .then((data) => {
        setCompanyStats(data)
        setCompanyLoading(false)
      })
      .catch(() => setCompanyLoading(false))
  }, [tab, companyStats, user])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const myStats = computeStats(myLogs)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">AI 사용량</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          GPT-5.4-mini &nbsp;·&nbsp; 입력 $0.75/1M · 출력 $4.50/1M 토큰
        </p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-6">
        {([['my', '내 사용량'], ['company', '회사 전체']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 내 사용량 ── */}
      {tab === 'my' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <KpiCard icon={<DollarSign size={20} />} label="누적 총 비용" value={formatUsd(myStats.totalCostUsd)} color="green" />
            <KpiCard icon={<Calendar size={20} />} label="이번 달 비용" value={formatUsd(myStats.thisMonthCostUsd)} color="blue" />
            <KpiCard icon={<MessageSquare size={20} />} label="전체 요청 수" value={myStats.totalRequests.toLocaleString()} color="purple" />
            <KpiCard
              icon={<TrendingUp size={20} />}
              label="요청당 평균 비용"
              value={myStats.totalRequests > 0 ? formatUsd(myStats.totalCostUsd / myStats.totalRequests) : '$0.00'}
              color="orange"
            />
          </div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">요청 로그</h2>
          <LogTable logs={myLogs} />
        </>
      )}

      {/* ── 회사 전체 (집계 숫자만) ── */}
      {tab === 'company' && (
        <>
          {companyLoading ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner size="lg" />
            </div>
          ) : companyStats ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <KpiCard icon={<DollarSign size={20} />} label="전체 누적 비용" value={formatUsd(companyStats.totalCostUsd)} color="green" />
                <KpiCard icon={<Calendar size={20} />} label="이번 달 비용" value={formatUsd(companyStats.thisMonthCostUsd)} color="blue" />
                <KpiCard icon={<MessageSquare size={20} />} label="전체 요청 수" value={companyStats.totalRequests.toLocaleString()} color="purple" />
                <KpiCard icon={<Users size={20} />} label="활성 사용자" value={companyStats.activeUsers.toString()} color="orange" />
              </div>

              <Card className="p-4 bg-gray-50 border-gray-200">
                <p className="text-xs text-gray-500 text-center">
                  개인별 상세 사용 내역은 본인만 확인할 수 있습니다.
                </p>
              </Card>
            </>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-gray-400 text-sm">통계를 불러올 수 없습니다.</p>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
