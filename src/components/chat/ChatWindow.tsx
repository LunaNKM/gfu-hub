'use client'

import React, { useEffect, useRef } from 'react'
import { Message } from '@/types'
import { MessageBubble } from './MessageBubble'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { MessageSquare } from 'lucide-react'

interface ChatWindowProps {
  messages: Message[]
  isLoading?: boolean
}

export function ChatWindow({ messages, isLoading }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <MessageSquare size={48} className="text-gray-200 mb-4" />
        <p className="text-gray-400 text-sm">메시지를 입력해서 대화를 시작하세요</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {isLoading && (
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600 mt-1 shrink-0">
            AI
          </div>
          <div className="px-4 py-3 bg-white border border-gray-200 rounded-2xl rounded-tl-sm">
            <LoadingSpinner size="sm" />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}

export default ChatWindow
