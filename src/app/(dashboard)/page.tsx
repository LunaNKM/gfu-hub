'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, AppWindow, FileText, ArrowRight, Send } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getConversations, createConversation } from '@/lib/services/chat'
import { Conversation } from '@/types'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import Link from 'next/link'

export default function HomePage() {
  const { user } = useAuth()
  const router = useRouter()
  const [inputValue, setInputValue] = useState('')
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      getConversations(user.uid).then((convs) => {
        setRecentConversations(convs.slice(0, 3))
      })
    }
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || !user) return

    setLoading(true)
    try {
      const convId = await createConversation(user.uid, inputValue.trim().slice(0, 50))
      router.push(`/chat/${convId}?init=${encodeURIComponent(inputValue.trim())}`)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return '좋은 아침이에요'
    if (hour < 18) return '안녕하세요'
    return '안녕하세요'
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-16">
      <div className="w-full max-w-2xl">
        {/* 인사말 */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {greeting()}, {user?.displayName?.split(' ')[0] || ''}님
          </h1>
          <p className="text-gray-500">무엇을 도와드릴까요?</p>
        </div>

        {/* AI 입력창 */}
        <form onSubmit={handleSubmit} className="mb-10">
          <div className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-2xl shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <MessageSquare size={18} className="text-gray-400 ml-1 shrink-0" />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="AI에게 질문하거나 작업을 요청하세요..."
              className="flex-1 text-sm outline-none bg-transparent text-gray-900 placeholder:text-gray-400"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || loading}
              className="flex items-center justify-center w-8 h-8 bg-blue-500 rounded-xl text-white hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Send size={14} />
            </button>
          </div>
        </form>

        {/* 바로가기 카드 */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          <Link
            href="/chat"
            className="flex flex-col items-center gap-2 p-5 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all text-center"
          >
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <MessageSquare size={20} className="text-blue-500" />
            </div>
            <span className="text-sm font-medium text-gray-800">AI 채팅</span>
            <span className="text-xs text-gray-400">대화 목록 보기</span>
          </Link>

          <Link
            href="/apps"
            className="flex flex-col items-center gap-2 p-5 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all text-center"
          >
            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
              <AppWindow size={20} className="text-purple-500" />
            </div>
            <span className="text-sm font-medium text-gray-800">앱 런처</span>
            <span className="text-xs text-gray-400">업무 앱 바로가기</span>
          </Link>

          <Link
            href="/docs"
            className="flex flex-col items-center gap-2 p-5 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all text-center"
          >
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
              <FileText size={20} className="text-green-500" />
            </div>
            <span className="text-sm font-medium text-gray-800">문서 허브</span>
            <span className="text-xs text-gray-400">사내 문서 검색</span>
          </Link>
        </div>

        {/* 최근 대화 */}
        {recentConversations.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">최근 대화</h2>
              <Link href="/chat" className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600">
                전체 보기 <ArrowRight size={12} />
              </Link>
            </div>
            <div className="space-y-2">
              {recentConversations.map((conv) => (
                <Link
                  key={conv.id}
                  href={`/chat/${conv.id}`}
                  className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-gray-200 hover:shadow-sm transition-all"
                >
                  <MessageSquare size={16} className="text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-700 flex-1 truncate">{conv.title}</span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {format(conv.updatedAt, 'M.d', { locale: ko })}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
