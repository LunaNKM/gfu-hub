'use client'

import React from 'react'
import { ExternalLink, Edit2, Trash2 } from 'lucide-react'
import { App } from '@/types'

interface AppCardProps {
  app: App
  onEdit: (app: App) => void
  onDelete: (id: string) => void
}

export function AppCard({ app, onEdit, onDelete }: AppCardProps) {
  return (
    <div className="group bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition-all">
      <div className="flex items-start gap-3">
        {/* 아이콘 */}
        <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-xl shrink-0">
          {app.icon || '🔗'}
        </div>

        {/* 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{app.name}</h3>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{app.url}</p>
            </div>
            {/* 액션 버튼 */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => onEdit(app)}
                className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={() => onDelete(app.id)}
                className="p-1 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* 카테고리 */}
          <div className="flex items-center justify-between mt-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
              {app.category}
            </span>
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 transition-colors"
            >
              열기
              <ExternalLink size={11} />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AppCard
