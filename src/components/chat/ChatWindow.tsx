'use client'

import React, { useEffect, useRef, useCallback } from 'react'
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
  const containerRef = useRef<HTMLDivElement>(null)
  // 사용자가 위로 스크롤했는지 추적
  const userScrolledUp = useRef(false)

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    // 하단에서 100px 이상 위면 "사용자가 스크롤 올림"으로 판단
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    userScrolledUp.current = distanceFromBottom > 100
  }, [])

  useEffect(() => {
    // 사용자가 스크롤을 올렸으면 자동 스크롤하지 않음
    if (userScrolledUp.current) return
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
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-6 space-y-6"
    >
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
