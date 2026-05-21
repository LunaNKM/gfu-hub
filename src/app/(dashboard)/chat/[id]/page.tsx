'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
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
import { ChatInput, AttachedFile } from '@/components/chat/ChatInput'
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
  const abortControllerRef = useRef<AbortController | null>(null)

  const handleStop = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsLoading(false)
  }

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

  useEffect(() => {
    const initMessage = searchParams.get('init')
    if (initMessage && messages.length === 0 && !initialized && id) {
      setInitialized(true)
      handleSend(initMessage, true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, messages.length, initialized])

  const handleSend = async (content: string, ragEnabled: boolean, attachments?: AttachedFile[]) => {
    if (!user || !id) return

    // 사용자 메시지 저장 및 표시
    const userMsg: Omit<Message, 'id' | 'createdAt'> = { role: 'user', content }
    const tempUserId = `temp-user-${Date.now()}`
    setMessages((prev) => [...prev, { ...userMsg, id: tempUserId, createdAt: new Date() }])
    setIsLoading(true)

    // AbortController 생성
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const msgId = await addMessage(id, userMsg)
      setMessages((prev) => prev.map((m) => (m.id === tempUserId ? { ...m, id: msgId } : m)))

      const token = await user.getIdToken()

      // 현재 메시지 목록에서 히스토리 추출 (방금 추가한 것 제외)
      const currentMessages = await getMessages(id)
      const history = currentMessages
        .filter((m) => m.id !== msgId)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }))

      // 첨부 파일을 메시지에 포함
      const attachmentContext = attachments && attachments.length > 0
        ? attachments
            .filter((a) => a.extractedText)
            .map((a) => `\n\n[첨부 파일: ${a.fileName}]\n${a.extractedText}`)
            .join('')
        : ''
      const messageWithAttachments = content + attachmentContext

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: id,
          message: messageWithAttachments,
          history,
          ragEnabled,
        }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`)
      }

      // SSE 스트리밍 처리
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      const streamingId = `streaming-${Date.now()}`
      let planContent = ''
      let mainContent = ''
      let searchStatus = ''
      let tokenUsage: Message['tokenUsage'] | undefined

      // 스트리밍 메시지 플레이스홀더 추가
      setMessages((prev) => [
        ...prev,
        { id: streamingId, role: 'assistant', content: '', createdAt: new Date() },
      ])

      const updateStreamingMsg = (plan: string, status: string, main: string) => {
        let content = ''
        if (plan) content += `> ${plan}\n\n`
        if (status) content += `*${status}*\n\n`
        if (main) content += main
        setMessages((prev) =>
          prev.map((m) => (m.id === streamingId ? { ...m, content } : m))
        )
      }

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))

            if (data.type === 'plan') {
              planContent = data.content
              updateStreamingMsg(planContent, '', '')
            } else if (data.type === 'search_done') {
              searchStatus = data.content
              updateStreamingMsg(planContent, searchStatus, '')
            } else if (data.type === 'chunk') {
              mainContent += data.content
              updateStreamingMsg(planContent, '', mainContent)
            } else if (data.type === 'done') {
              tokenUsage = data.tokenUsage
              const finalContent =
                (planContent ? `> ${planContent}\n\n` : '') + mainContent

              const assistantMsg: Omit<Message, 'id' | 'createdAt'> = {
                role: 'assistant',
                content: finalContent,
                tokenUsage,
              }
              const assistantId = await addMessage(id, assistantMsg)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId
                    ? { ...m, id: assistantId, content: finalContent, tokenUsage }
                    : m
                )
              )
              await fetchConversations()

              // 백그라운드: 대화에서 핵심 사실 추출 → 장기 기억 저장 (fire-and-forget)
              user?.getIdToken().then((tkn) =>
                fetch('/api/memory/extract', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkn}` },
                  body: JSON.stringify({
                    conversationId: id,
                    history: [
                      ...history.slice(-4),
                      { role: 'user', content },
                      { role: 'assistant', content: mainContent },
                    ],
                  }),
                }).catch(() => {})
              )
            } else if (data.type === 'error') {
              showToast(data.content || 'AI 응답 중 오류가 발생했습니다.', 'error')
              setMessages((prev) => prev.filter((m) => m.id !== streamingId))
            }
          } catch {
            // JSON 파싱 실패 무시
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // 사용자가 중지 버튼을 눌렀을 때 — 오류 표시 없이 스트리밍 메시지 제거
        setMessages((prev) => prev.filter((m) => !m.id.startsWith('streaming-')))
      } else {
        console.error('Chat 오류:', error)
        showToast('AI 응답 중 오류가 발생했습니다.', 'error')
        setMessages((prev) => prev.filter((m) => !m.id.startsWith('streaming-')))
      }
    } finally {
      abortControllerRef.current = null
      setIsLoading(false)
    }
  }

  const handleOptimizePrompt = async (prompt: string): Promise<string> => {
    try {
      const token = await user?.getIdToken()
      const response = await fetch('/api/prompt-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
    if (convId === id) router.push('/chat')
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
          onStop={handleStop}
          isLoading={isLoading}
          disabled={false}
        />
      </div>
    </div>
  )
}
