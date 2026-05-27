'use client'

import { BarChart3 } from 'lucide-react'
import type { CampaignBlock, CampaignDatabase } from '@/types'
import { buildDatabaseChartRecommendations } from '@/lib/campaigns/chartRecommendations'
import { ChartPreview } from './ChartPreview'

export function ChartEmbedBlock({
  block,
  databases,
  onUpdate,
}: {
  block: CampaignBlock
  databases: CampaignDatabase[]
  onUpdate: (content: Record<string, unknown>) => void
}) {
  const databaseId = String(block.content.databaseId ?? '')
  const database = databases.find((item) => item.id === databaseId)
  const options = database ? buildDatabaseChartRecommendations(database) : []
  const chartId = String(block.content.chartId ?? '')
  const chart = options.find((option) => option.id === chartId) ?? options[0]

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
          <BarChart3 size={13} className="text-gray-400" />
          추천 차트
        </div>
        <select value={databaseId} onChange={(event) => onUpdate({ databaseId: event.target.value, chartId: '' })} className="rounded border border-gray-200 bg-white px-2 py-1 text-xs outline-none">
          <option value="">데이터베이스 선택</option>
          {databases.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        {database && (
          <select value={chart?.id ?? ''} onChange={(event) => onUpdate({ ...block.content, databaseId, chartId: event.target.value })} className="rounded border border-gray-200 bg-white px-2 py-1 text-xs outline-none">
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        )}
      </div>
      {!database ? (
        <div className="p-5 text-center text-xs text-gray-400">차트를 만들 데이터베이스를 선택하세요.</div>
      ) : !chart ? (
        <div className="p-5 text-center text-xs text-gray-400">추천 가능한 차트가 없습니다. 데이터를 먼저 입력하세요.</div>
      ) : (
        <>
          <p className="mb-3 text-sm font-semibold text-gray-800">{chart.title}</p>
          <ChartPreview chart={chart} />
        </>
      )}
    </div>
  )
}
