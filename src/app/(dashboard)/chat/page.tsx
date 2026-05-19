'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Conversation } from '@/types'
import {
  getConversations,
  createConversation,
  deleteConversation,
} from '@/lib/services/chat'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { MessageSquare } from 'lucide-react'

export default function ChatPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])

  useEffect(() => {
    if (user) {
      getConversations(user.uid).then(setConversations)
    }
  }, [user])

  const handleNewChat = async () => {
    if (!user) return
    const id = await createConversation(user.uid, '새 대화')
    router.push(`/chat/${id}`)
  }

  const handleDeleteConversation = async (id: string) => {
    await deleteConversation(id)
    setConversations((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="flex h-full">
      <ChatSidebar
        conversations={conversations}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
      />
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <MessageSquare size={56} className="text-gray-200 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700 mb-1">대화를 시작해보세요</p>
          <p className="text-sm text-gray-400">왼쪽에서 기존 대화를 선택하거나 새 대화를 시작하세요</p>
        </div>
      </div>
    </div>
  )
}
