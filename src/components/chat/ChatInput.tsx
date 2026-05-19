'use client'

import React, { useState, useRef, KeyboardEvent, useCallback } from 'react'
import { Send, Sparkles, Paperclip, Square, X, FileText, Image as ImageIcon } from 'lucide-react'
import { clsx } from 'clsx'

export interface AttachedFile {
  id: string
  fileName: string
  fileType: string
  size: number
  extractedText?: string
  previewUrl?: string
}

interface ChatInputProps {
  onSend: (message: string, ragEnabled: boolean, attachments?: AttachedFile[]) => void
  onOptimizePrompt: (prompt: string) => Promise<string>
  onStop?: () => void
  disabled?: boolean
  isLoading?: boolean
}

const TEXT_TYPES = ['text/plain', 'text/markdown', 'text/csv', 'application/json', 'text/html']
const TEXT_EXTS = ['.txt', '.md', '.csv', '.json', '.html', '.htm']
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const MAX_SIZE_MB = 10

async function readFileContent(file: File): Promise<Partial<AttachedFile>> {
  const isText =
    TEXT_TYPES.includes(file.type) ||
    TEXT_EXTS.some((ext) => file.name.toLowerCase().endsWith(ext))
  const isImage = IMAGE_TYPES.includes(file.type)

  if (isText) {
    const text = await file.text()
    return { extractedText: text.slice(0, 50000) }
  }

  if (isImage) {
    const url = URL.createObjectURL(file)
    return { previewUrl: url }
  }

  return {}
}

export function ChatInput({ onSend, onOptimizePrompt, onStop, disabled, isLoading }: ChatInputProps) {
  const [message, setMessage] = useState('')
  const [ragEnabled, setRagEnabled] = useState(true)
  const [optimizing, setOptimizing] = useState(false)
  const [attachments, setAttachments] = useState<AttachedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    if ((!message.trim() && attachments.length === 0) || disabled || isLoading) return
    onSend(message.trim(), ragEnabled, attachments.length > 0 ? attachments : undefined)
    setMessage('')
    setAttachments([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
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

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files)
    for (const file of arr) {
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        alert(`${file.name}: 파일 크기가 ${MAX_SIZE_MB}MB를 초과합니다.`)
        continue
      }
      const extra = await readFileContent(file)
      const attached: AttachedFile = {
        id: `${Date.now()}-${file.name}`,
        fileName: file.name,
        fileType: file.type,
        size: file.size,
        ...extra,
      }
      setAttachments((prev) => [...prev, attached])
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files)
    e.target.value = ''
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const file = prev.find((f) => f.id === id)
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl)
      return prev.filter((f) => f.id !== id)
    })
  }

  // 드래그 앤 드롭
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  }

  return (
    <div
      className="border-t border-gray-100 px-4 py-3 bg-white"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 드래그 오버레이 */}
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-50/90 border-2 border-dashed border-blue-400 rounded-xl pointer-events-none">
          <p className="text-blue-600 font-medium text-sm">파일을 여기에 놓으세요</p>
        </div>
      )}

      {/* 첨부 파일 목록 */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-lg text-xs text-gray-700 max-w-[200px]"
            >
              {file.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.previewUrl} alt={file.fileName} className="w-4 h-4 object-cover rounded" />
              ) : file.extractedText ? (
                <FileText size={12} className="text-blue-500 shrink-0" />
              ) : (
                <ImageIcon size={12} className="text-gray-400 shrink-0" />
              )}
              <span className="truncate">{file.fileName}</span>
              <span className="text-gray-400 shrink-0">({formatSize(file.size)})</span>
              <button onClick={() => removeAttachment(file.id)} className="shrink-0 text-gray-400 hover:text-red-500">
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 입력 영역 */}
      <div className={clsx(
        'flex items-end gap-2 p-3 border rounded-2xl transition-all bg-white',
        isDragging
          ? 'border-blue-400 ring-2 ring-blue-100'
          : 'border-gray-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100'
      )}>
        {/* 파일 첨부 버튼 */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className={clsx(
            'p-1 transition-colors mb-0.5 shrink-0',
            isLoading ? 'text-gray-200' : 'text-gray-400 hover:text-blue-500'
          )}
          title="파일 첨부"
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
          accept=".txt,.md,.csv,.json,.html,.htm,.png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.xlsx"
        />

        {/* 텍스트 입력 */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder={isDragging ? '파일을 여기에 놓으세요...' : '메시지를 입력하세요... (Shift+Enter로 줄바꿈)'}
          rows={1}
          disabled={disabled || isLoading}
          className="flex-1 resize-none outline-none text-sm text-gray-900 placeholder:text-gray-400 bg-transparent max-h-48"
        />

        {/* 프롬프트 다듬기 */}
        <button
          type="button"
          onClick={handleOptimize}
          disabled={!message.trim() || optimizing || isLoading}
          className={clsx(
            'p-1 transition-colors mb-0.5 shrink-0',
            message.trim() && !isLoading
              ? 'text-yellow-500 hover:text-yellow-600'
              : 'text-gray-300'
          )}
          title="프롬프트 다듬기"
        >
          <Sparkles size={18} className={optimizing ? 'animate-pulse' : ''} />
        </button>

        {/* 전송 / 중지 버튼 */}
        {isLoading ? (
          <button
            type="button"
            onClick={onStop}
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors mb-0.5 shrink-0"
            title="답변 중지"
          >
            <Square size={12} fill="white" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!message.trim() && attachments.length === 0}
            className={clsx(
              'flex items-center justify-center w-8 h-8 rounded-xl transition-colors mb-0.5 shrink-0',
              message.trim() || attachments.length > 0
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
            )}
          >
            <Send size={14} />
          </button>
        )}
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
        {attachments.length > 0 && (
          <span className="text-xs text-blue-500 ml-auto">
            📎 {attachments.length}개 파일 첨부됨
          </span>
        )}
      </div>
    </div>
  )
}

export default ChatInput
