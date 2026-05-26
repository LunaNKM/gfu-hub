'use client'

import React from 'react'
import { Trash2 } from 'lucide-react'
import { CampaignSection, CampaignCrmSyncType } from '@/types'

interface SectionSettingsProps {
  section: CampaignSection
  onUpdate: (patch: Partial<CampaignSection>) => void
  onDelete: () => void
}

const CRM_OPTIONS: { value: '' | CampaignCrmSyncType; label: string }[] = [
  { value: '', label: '없음' },
  { value: 'confirmed_influencers', label: '확정 인원 리스트' },
  { value: 'influencer_performance', label: '인플루언서 성과' },
]

export function SectionSettings({ section, onUpdate, onDelete }: SectionSettingsProps) {
  return (
    <div className="w-70 border-l border-gray-200 bg-white flex flex-col h-full overflow-y-auto" style={{ width: 280 }}>
      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">섹션 설정</p>
      </div>

      <div className="flex-1 px-4 py-4 space-y-5">
        {/* 제목 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">섹션 제목</label>
          <input
            type="text"
            value={section.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
        </div>

        {/* 표시/공유 설정 */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-600">표시 설정</p>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={section.internalVisible}
              onChange={(e) => onUpdate({ internalVisible: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
            />
            <span className="text-sm text-gray-700">내부 표시</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={section.clientShareEnabled}
              onChange={(e) => onUpdate({ clientShareEnabled: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
            />
            <span className="text-sm text-gray-700">고객 공유</span>
          </label>

          {section.clientShareEnabled && (
            <label className="flex items-center gap-2.5 cursor-pointer ml-6">
              <input
                type="checkbox"
                checked={section.clientEditable}
                onChange={(e) => onUpdate({ clientEditable: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
              />
              <span className="text-sm text-gray-700">고객 수정 가능</span>
            </label>
          )}
        </div>

        {/* CRM 연동 (data_table만) */}
        {section.type === 'data_table' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">CRM 연동</label>
            <select
              value={section.crmSyncType ?? ''}
              onChange={(e) =>
                onUpdate({ crmSyncType: (e.target.value as CampaignCrmSyncType) || undefined })
              }
              className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 outline-none focus:border-blue-400 bg-white"
            >
              {CRM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 삭제 */}
      <div className="px-4 py-3 border-t border-gray-100 shrink-0">
        <button
          onClick={onDelete}
          className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded w-full transition-colors"
        >
          <Trash2 size={14} />
          섹션 삭제
        </button>
      </div>
    </div>
  )
}
