'use client'

import React, { useState } from 'react'
import { Plus } from 'lucide-react'
import {
  CampaignDashboardContent,
  CampaignDashboardWidget,
  CampaignDashboardWidgetType,
  CampaignDashboardAggregation,
  CampaignSection,
  CampaignDataTableContent,
} from '@/types'
import { DashboardWidget } from './DashboardWidget'

const WIDGET_TYPES: { value: CampaignDashboardWidgetType; label: string }[] = [
  { value: 'kpi',     label: 'KPI 수치' },
  { value: 'bar',     label: '막대 차트' },
  { value: 'line',    label: '선 차트' },
  { value: 'pie',     label: '파이 차트' },
  { value: 'funnel',  label: '퍼널 차트' },
  { value: 'ranking', label: '랭킹' },
]

const AGGREGATIONS: { value: CampaignDashboardAggregation; label: string }[] = [
  { value: 'sum',   label: '합계' },
  { value: 'avg',   label: '평균' },
  { value: 'count', label: '개수' },
  { value: 'min',   label: '최소' },
  { value: 'max',   label: '최대' },
]

interface Props {
  content: CampaignDashboardContent
  allSections: CampaignSection[]
  onChange: (content: CampaignDashboardContent) => void
}

function AddWidgetForm({
  dataSections,
  onAdd,
  onCancel,
}: {
  dataSections: CampaignSection[]
  onAdd: (widget: CampaignDashboardWidget) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<CampaignDashboardWidgetType>('bar')
  const [sourceSectionId, setSourceSectionId] = useState(dataSections[0]?.id ?? '')
  const [aggregation, setAggregation] = useState<CampaignDashboardAggregation>('sum')
  const [dimensionColumnId, setDimensionColumnId] = useState('')
  const [metricColumnId, setMetricColumnId] = useState('')

  const sourceSection = dataSections.find((s) => s.id === sourceSectionId)
  const columns = (sourceSection?.content as CampaignDataTableContent | undefined)?.columns ?? []

  return (
    <div className="border border-blue-200 rounded p-4 bg-blue-50 space-y-3">
      <p className="text-sm font-semibold text-gray-800">위젯 추가</p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="위젯 제목"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400 bg-white"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">위젯 타입</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CampaignDashboardWidgetType)}
            className="w-full text-sm border border-gray-200 rounded px-2 py-1 bg-white outline-none"
          >
            {WIDGET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">데이터 소스</label>
          <select
            value={sourceSectionId}
            onChange={(e) => {
              setSourceSectionId(e.target.value)
              setDimensionColumnId('')
              setMetricColumnId('')
            }}
            className="w-full text-sm border border-gray-200 rounded px-2 py-1 bg-white outline-none"
          >
            {dataSections.length === 0 && <option value="">데이터 테이블 없음</option>}
            {dataSections.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">집계 방식</label>
          <select
            value={aggregation}
            onChange={(e) => setAggregation(e.target.value as CampaignDashboardAggregation)}
            className="w-full text-sm border border-gray-200 rounded px-2 py-1 bg-white outline-none"
          >
            {AGGREGATIONS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">차원 컬럼 (X축)</label>
          <select
            value={dimensionColumnId}
            onChange={(e) => setDimensionColumnId(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded px-2 py-1 bg-white outline-none"
          >
            <option value="">선택</option>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">지표 컬럼 (값)</label>
          <select
            value={metricColumnId}
            onChange={(e) => setMetricColumnId(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded px-2 py-1 bg-white outline-none"
          >
            <option value="">선택</option>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() =>
            onAdd({
              id: `widget_${Date.now()}`,
              title: title || (WIDGET_TYPES.find((t) => t.value === type)?.label ?? '위젯'),
              type,
              sourceSectionId: sourceSectionId || undefined,
              dimensionColumnId: dimensionColumnId || undefined,
              metricColumnId: metricColumnId || undefined,
              aggregation,
            })
          }
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          추가
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 border border-gray-200 text-sm rounded hover:bg-gray-50"
        >
          취소
        </button>
      </div>
    </div>
  )
}

export function DashboardSectionEditor({ content, allSections, onChange }: Props) {
  const [showAddForm, setShowAddForm] = useState(false)

  const dataSections = allSections.filter((s) => s.type === 'data_table')

  const addWidget = (widget: CampaignDashboardWidget) => {
    onChange({ widgets: [...content.widgets, widget] })
    setShowAddForm(false)
  }

  const deleteWidget = (widgetId: string) => {
    onChange({ widgets: content.widgets.filter((w) => w.id !== widgetId) })
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-gray-700">대시보드 위젯</p>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 px-3 py-1.5 border border-blue-200 rounded bg-blue-50"
        >
          <Plus size={13} /> 위젯 추가
        </button>
      </div>

      {showAddForm && (
        <div className="mb-4">
          <AddWidgetForm
            dataSections={dataSections}
            onAdd={addWidget}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {content.widgets.length === 0 && !showAddForm ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400 border-2 border-dashed border-gray-200 rounded text-sm">
          <p>위젯이 없습니다</p>
          <p className="text-xs mt-1">위젯 추가 버튼을 눌러 시작하세요</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {content.widgets.map((widget) => (
            <DashboardWidget
              key={widget.id}
              widget={widget}
              dataSections={dataSections}
              onDelete={() => deleteWidget(widget.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
