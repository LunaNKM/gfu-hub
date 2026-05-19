'use client'

import React, { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Message } from '@/types'
import { clsx } from 'clsx'
import { format } from 'date-fns'

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={clsx('group flex gap-3', {
        'flex-row-reverse': isUser,
      })}
    >
      {/* 아바타 */}
      <div
        className={clsx(
          'w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-medium mt-1',
          isUser ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
        )}
      >
        {isUser ? 'U' : 'AI'}
      </div>

      {/* 메시지 */}
      <div className={clsx('flex flex-col gap-1 max-w-[75%]', isUser && 'items-end')}>
        <div
          className={clsx(
            'px-4 py-3 rounded-2xl text-sm leading-relaxed',
            isUser
              ? 'bg-blue-500 text-white rounded-tr-sm'
              : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        <div className={clsx('flex items-center gap-2', isUser && 'flex-row-reverse')}>
          <span className="text-xs text-gray-400">
            {format(message.createdAt, 'HH:mm')}
          </span>
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-all"
          >
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            {copied ? '복사됨' : '복사'}
          </button>
          {message.tokenUsage && (
            <span className="opacity-0 group-hover:opacity-100 text-xs text-gray-300">
              {message.tokenUsage.totalTokens} 토큰
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default MessageBubble
