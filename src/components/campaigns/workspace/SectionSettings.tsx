'use client'

import React from 'react'
import { clsx } from 'clsx'
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

// ── 토글 스위치 (Tailwind 전용) ──────────────────────────────────
interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  sublabel?: string
}

function Toggle({ checked, onChange, label, sublabel }: ToggleProps) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <p className="text-sm text-gray-700">{label}</p>
        {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
          checked ? 'bg-blue-600' : 'bg-gray-200'
        )}
      >
        <span
          className={clsx(
            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-0.5',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  )
}

// ── 설정 그룹 헤더 ────────────────────────────────────────────────
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pb-1">
      {children}
    </p>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export function SectionSettings({ section, onUpdate, onDelete }: SectionSettingsProps) {
  return (
    <div
      className="border-l border-gray-200 bg-white flex flex-col h-full overflow-y-auto"
      style={{ width: 260 }}
    >
      {/* 헤더 */}
      <div className="px-4 py-4 border-b border-gray-100 shrink-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">섹션 설정</p>
      </div>

      <div className="flex-1 px-4 py-4 space-y-6">

        {/* ── 제목 ── */}
        <div>
          <GroupLabel>제목</GroupLabel>
          <input
            type="text"
            value={section.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 text-gray-800 placeholder-gray-300"
            placeholder="섹션 제목"
          />
        </div>

        {/* ── 표시 설정 ── */}
        <div>
          <GroupLabel>표시 설정</GroupLabel>
          <div className="space-y-1 divide-y divide-gray-50">
            <Toggle
              checked={section.internalVisible}
              onChange={(v) => onUpdate({ internalVisible: v })}
              label="내부 표시"
            />
            <Toggle
              checked={section.clientShareEnabled}
              onChange={(v) => onUpdate({ clientShareEnabled: v })}
              label="고객 공유"
            />
            {section.clientShareEnabled && (
              <Toggle
                checked={section.clientEditable}
                onChange={(v) => onUpdate({ clientEditable: v })}
                label="고객 수정 가능"
                sublabel="고객이 직접 편집할 수 있어요"
              />
            )}
          </div>
        </div>

        {/* ── CRM 연동 (data_table만) ── */}
        {section.type === 'data_table' && (
          <div>
            <GroupLabel>CRM 연동</GroupLabel>
            <select
              value={section.crmSyncType ?? ''}
              onChange={(e) =>
                onUpdate({ crmSyncType: (e.target.value as CampaignCrmSyncType) || undefined })
              }
              className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 outline-none focus:border-blue-400 bg-white text-gray-700"
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

      {/* ── 삭제 ── */}
      <div className="px-4 py-3 border-t border-gray-100 shrink-0">
        <button
          onClick={onDelete}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-500 hover:bg-red-50 px-3 py-2 rounded-md w-full transition-colors"
        >
          <Trash2 size={13} />
          섹션 삭제
        </button>
      </div>
    </div>
  )
}
