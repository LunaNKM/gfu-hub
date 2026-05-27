'use client'

import React, { useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Loader2 } from 'lucide-react'
import {
  CampaignDataTableContent,
} from '@/types'
import { SectionSidebar, type ActiveView } from './SectionSidebar'
import { CampaignOverviewDashboard } from './CampaignOverviewDashboard'
import { CampaignDatabaseEditor } from './CampaignDatabaseEditor'
import { CampaignSectionDocument } from './CampaignSectionDocument'
import { DataTableSectionEditor } from './DataTableSectionEditor'
import { useCampaignWorkspace } from './hooks/useCampaignWorkspace'

interface Props {
  campaignId: string
}

export function CampaignWorkspace({ campaignId }: Props) {
  const { user } = useAuth()
  const [activeView, setActiveView] = useState<ActiveView>({ type: 'overview' })
  const workspace = useCampaignWorkspace(campaignId, user)

  const activeSection = useMemo(
    () =>
      activeView.type === 'section'
        ? workspace.sections.find((section) => section.id === activeView.id) ?? null
        : null,
    [activeView, workspace.sections]
  )

  const activeDatabase = useMemo(
    () =>
      activeView.type === 'database'
        ? workspace.databases.find((database) => database.id === activeView.id) ?? null
        : null,
    [activeView, workspace.databases]
  )

  const breadcrumb =
    activeView.type === 'overview'
      ? '종합 대시보드'
      : activeSection?.title ?? activeDatabase?.title ?? ''

  const addSection = async (...args: Parameters<typeof workspace.addSection>) => {
    const section = await workspace.addSection(...args)
    if (section) setActiveView({ type: 'section', id: section.id })
  }

  const addDatabase = async (...args: Parameters<typeof workspace.addDatabase>) => {
    const database = await workspace.addDatabase(...args)
    if (database) setActiveView({ type: 'database', id: database.id })
  }

  if (workspace.loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-300">
        <Loader2 size={24} className="animate-spin" />
      </div>
    )
  }

  if (workspace.error || !workspace.campaign) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-gray-400">
        <p className="text-sm">{workspace.error ?? '캠페인을 찾을 수 없습니다.'}</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <SectionSidebar
        campaignName={workspace.campaign.campaignName}
        clientName={workspace.campaign.clientName}
        sections={workspace.sections}
        databases={workspace.databases}
        activeView={activeView}
        onSelectView={setActiveView}
        onAddSection={addSection}
        onAddDatabase={addDatabase}
        onReorder={workspace.reorderSections}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="shrink-0 truncate text-xs text-gray-400">{workspace.campaign.clientName}</span>
            <span className="shrink-0 text-xs text-gray-300">/</span>
            <span className="truncate text-sm font-medium text-gray-700">{breadcrumb}</span>
          </div>
          <SaveIndicator status={workspace.saveStatus} />
        </div>

        <div className="flex-1 overflow-hidden">
          {activeView.type === 'overview' && (
            <CampaignOverviewDashboard overview={workspace.overview} />
          )}

          {activeView.type === 'section' && activeSection && (
            <>
              {activeSection.type === 'document' && (
                <CampaignSectionDocument
                  key={activeSection.id}
                  section={activeSection}
                  blocks={workspace.blocks}
                  databases={workspace.databases}
                  onBlockUpdate={workspace.updateBlock}
                  onBlockPatch={workspace.patchBlock}
                  onBlockAdd={workspace.addBlock}
                  onBlockDelete={workspace.deleteBlock}
                  onBlockMove={workspace.moveBlock}
                  onDatabaseCellChange={workspace.updateDatabaseRow}
                  onDatabaseRowAdd={(databaseId) => { void workspace.addDatabaseRow(databaseId) }}
                  onDatabaseRowsDelete={workspace.deleteDatabaseRows}
                  onDatabaseColumnsChange={workspace.updateDatabaseColumns}
                />
              )}
              {activeSection.type === 'data_table' && (
                <DataTableSectionEditor
                  key={activeSection.id}
                  content={activeSection.content as CampaignDataTableContent}
                  onChange={(content) => workspace.updateSection(activeSection.id, { content })}
                />
              )}
              {activeSection.type === 'dashboard' && (
                <EmptyState label="수동 위젯 대시보드는 더 이상 사용하지 않습니다. 종합 대시보드를 이용하세요." />
              )}
            </>
          )}

          {activeView.type === 'database' && activeDatabase && (
            <CampaignDatabaseEditor
              key={activeDatabase.id}
              database={activeDatabase}
              onChange={(patch) => workspace.updateDatabase(activeDatabase.id, patch)}
              onCellChange={(rowId, colId, value) =>
                workspace.updateDatabaseRow(activeDatabase.id, rowId, colId, value)
              }
              onRowAdd={() => workspace.addDatabaseRow(activeDatabase.id)}
              onRowsDelete={(rowIds) => workspace.deleteDatabaseRows(activeDatabase.id, rowIds)}
              onColumnsChange={(columns) =>
                workspace.updateDatabaseColumns(activeDatabase.id, columns)
              }
            />
          )}

          {activeView.type === 'section' && !activeSection && (
            <EmptyState label="섹션을 찾을 수 없습니다." />
          )}
          {activeView.type === 'database' && !activeDatabase && (
            <EmptyState label="데이터베이스를 찾을 수 없습니다." />
          )}
        </div>
      </div>
    </div>
  )
}

function SaveIndicator({ status }: { status: 'idle' | 'loading' | 'saving' | 'saved' | 'error' }) {
  if (status === 'saving') return <Indicator color="bg-yellow-400" label="저장 중..." pulse />
  if (status === 'saved') return <Indicator color="bg-green-400" label="저장됨" />
  if (status === 'error') return <Indicator color="bg-red-400" label="저장 실패" danger />
  return null
}

function Indicator({
  color,
  label,
  pulse,
  danger,
}: {
  color: string
  label: string
  pulse?: boolean
  danger?: boolean
}) {
  return (
    <div className="ml-4 flex shrink-0 items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${color} ${pulse ? 'animate-pulse' : ''}`} />
      <span className={`text-xs ${danger ? 'text-red-400' : 'text-gray-400'}`}>{label}</span>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-gray-400">
      {label}
    </div>
  )
}
