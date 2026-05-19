'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus, MessageSquare, Trash2 } from 'lucide-react'
import { Conversation } from '@/types'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { clsx } from 'clsx'

interface ChatSidebarProps {
  conversations: Conversation[]
  onNewChat: () => void
  onDeleteConversation: (id: string) => void
}

export function ChatSidebar({ conversations, onNewChat, onDeleteConversation }: ChatSidebarProps) {
  const pathname = usePathname()

  return (
    <div className="w-64 shrink-0 border-r border-gray-200 flex flex-col h-full bg-[#f8f9fa]">
      {/* 새 대화 버튼 */}
      <div className="p-3 border-b border-gray-200">
        <button
          onClick={onNewChat}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-white bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors"
        >
          <Plus size={16} />
          새 대화
        </button>
      </div>

      {/* 대화 목록 */}
      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare size={32} className="text-gray-300 mb-2" />
            <p className="text-xs text-gray-400">대화가 없습니다</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((conv) => {
              const isActive = pathname === `/chat/${conv.id}`
              return (
                <div
                  key={conv.id}
                  className={clsx(
                    'group flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors',
                    isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100 text-gray-700'
                  )}
                >
                  <Link href={`/chat/${conv.id}`} className="flex-1 min-w-0">
                    <p className="text-sm truncate">{conv.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(conv.updatedAt, 'M월 d일', { locale: ko })}
                    </p>
                  </Link>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteConversation(conv.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-100 text-gray-400 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default ChatSidebar
