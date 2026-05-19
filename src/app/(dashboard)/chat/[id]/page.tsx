'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Message, Conversation } from '@/types'
import {
  getConversations,
  createConversation,
  deleteConversation,
  getMessages,
  addMessage,
} from '@/lib/services/chat'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { ChatInput } from '@/components/chat/ChatInput'
import { useToast } from '@/components/ui/Toast'

export default function ChatDetailPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const router = useRouter()
  const { showToast } = useToast()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const fetchConversations = useCallback(async () => {
    if (!user) return
    const convs = await getConversations(user.uid)
    setConversations(convs)
  }, [user])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  useEffect(() => {
    if (id) {
      getMessages(id).then(setMessages)
    }
  }, [id])

  // 초기 메시지 처리 (홈에서 넘어온 경우)
  useEffect(() => {
    const initMessage = searchParams.get('init')
    if (initMessage && messages.length === 0 && !initialized && id) {
      setInitialized(true)
      handleSend(initMessage, true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, messages.length, initialized])

  const handleSend = async (content: string, ragEnabled: boolean) => {
    if (!user || !id) return

    const userMessage: Omit<Message, 'id' | 'createdAt'> = {
      role: 'user',
      content,
    }

    // 낙관적 UI 업데이트
    const tempId = `temp-${Date.now()}`
    const optimisticMsg: Message = {
      ...userMessage,
      id: tempId,
      createdAt: new Date(),
    }
    setMessages((prev) => [...prev, optimisticMsg])
    setIsLoading(true)

    try {
      // 메시지 저장
      const msgId = await addMessage(id, userMessage)

      // API 호출
      const token = await user.getIdToken()
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: id,
          message: content,
          ragEnabled,
        }),
      })

      if (!response.ok) {
        throw new Error('AI 응답 오류')
      }

      const data = await response.json()

      // 실제 메시지 ID로 교체
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, id: msgId } : m
        )
      )

      // AI 응답 저장 및 표시
      const assistantMsg: Omit<Message, 'id' | 'createdAt'> = {
        role: 'assistant',
        content: data.reply,
        tokenUsage: data.tokenUsage,
      }
      const assistantId = await addMessage(id, assistantMsg)
      setMessages((prev) => [
        ...prev,
        { ...assistantMsg, id: assistantId, createdAt: new Date() },
      ])

      await fetchConversations()
    } catch (error) {
      showToast('AI 응답 중 오류가 발생했습니다.', 'error')
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOptimizePrompt = async (prompt: string): Promise<string> => {
    try {
      const token = await user?.getIdToken()
      const response = await fetch('/api/prompt-optimize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt }),
      })
      if (!response.ok) throw new Error('최적화 실패')
      const data = await response.json()
      return data.optimizedPrompt || prompt
    } catch {
      showToast('프롬프트 최적화에 실패했습니다.', 'error')
      return prompt
    }
  }

  const handleNewChat = async () => {
    if (!user) return
    const newId = await createConversation(user.uid, '새 대화')
    router.push(`/chat/${newId}`)
    await fetchConversations()
  }

  const handleDeleteConversation = async (convId: string) => {
    await deleteConversation(convId)
    setConversations((prev) => prev.filter((c) => c.id !== convId))
    if (convId === id) {
      router.push('/chat')
    }
  }

  return (
    <div className="flex h-full">
      <ChatSidebar
        conversations={conversations}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <ChatWindow messages={messages} isLoading={isLoading} />
        <ChatInput
          onSend={handleSend}
          onOptimizePrompt={handleOptimizePrompt}
          disabled={isLoading}
        />
      </div>
    </div>
  )
}
