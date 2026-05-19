'use client'

import React, { useState, useRef, KeyboardEvent } from 'react'
import { Send, Sparkles, Paperclip } from 'lucide-react'
import { clsx } from 'clsx'

interface ChatInputProps {
  onSend: (message: string, ragEnabled: boolean) => void
  onOptimizePrompt: (prompt: string) => Promise<string>
  disabled?: boolean
}

export function ChatInput({ onSend, onOptimizePrompt, disabled }: ChatInputProps) {
  const [message, setMessage] = useState('')
  const [ragEnabled, setRagEnabled] = useState(true)
  const [optimizing, setOptimizing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    if (!message.trim() || disabled) return
    onSend(message.trim(), ragEnabled)
    setMessage('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)
    // 자동 높이 조절
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
  }

  const handleOptimize = async () => {
    if (!message.trim() || optimizing) return
    setOptimizing(true)
    try {
      const optimized = await onOptimizePrompt(message.trim())
      setMessage(optimized)
    } finally {
      setOptimizing(false)
    }
  }

  return (
    <div className="border-t border-gray-100 px-4 py-3 bg-white">
      <div className="flex items-end gap-2 p-3 border border-gray-200 rounded-2xl focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all bg-white">
        {/* 파일 업로드 */}
        <button
          type="button"
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors mb-0.5 shrink-0"
          title="파일 첨부 (준비 중)"
          disabled
        >
          <Paperclip size={18} />
        </button>

        {/* 텍스트 입력 */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요... (Shift+Enter로 줄바꿈)"
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none outline-none text-sm text-gray-900 placeholder:text-gray-400 bg-transparent max-h-48"
        />

        {/* 프롬프트 다듬기 */}
        <button
          type="button"
          onClick={handleOptimize}
          disabled={!message.trim() || optimizing || disabled}
          className={clsx(
            'p-1 transition-colors mb-0.5 shrink-0',
            message.trim() && !disabled
              ? 'text-yellow-500 hover:text-yellow-600'
              : 'text-gray-300'
          )}
          title="프롬프트 다듬기"
        >
          <Sparkles size={18} className={optimizing ? 'animate-pulse' : ''} />
        </button>

        {/* 전송 버튼 */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!message.trim() || disabled}
          className={clsx(
            'flex items-center justify-center w-8 h-8 rounded-xl transition-colors mb-0.5 shrink-0',
            message.trim() && !disabled
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-gray-100 text-gray-300 cursor-not-allowed'
          )}
        >
          <Send size={14} />
        </button>
      </div>

      {/* RAG 토글 */}
      <div className="flex items-center gap-2 mt-2 px-1">
        <button
          type="button"
          onClick={() => setRagEnabled(!ragEnabled)}
          className={clsx(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
            ragEnabled ? 'bg-blue-500' : 'bg-gray-200'
          )}
        >
          <span
            className={clsx(
              'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
              ragEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
            )}
          />
        </button>
        <span className="text-xs text-gray-500">사내 문서 검색 활성화</span>
      </div>
    </div>
  )
}

export default ChatInput
