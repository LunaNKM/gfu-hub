'use client'

import React, { useState } from 'react'
import { Download, FileText, Check } from 'lucide-react'

interface FileData {
  filename: string
  type?: 'csv' | 'markdown' | 'json' | 'txt'
  content: string
}

const MIME: Record<string, string> = {
  csv: 'text/csv;charset=utf-8',
  markdown: 'text/markdown;charset=utf-8',
  json: 'application/json;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
}

export function FileArtifact({ raw }: { raw: string }) {
  const [downloaded, setDownloaded] = useState(false)

  let parsed: FileData
  try {
    parsed = JSON.parse(raw)
  } catch {
    return <p className="text-xs text-red-500 p-2">파일 데이터 파싱 실패</p>
  }

  const { filename, type = 'txt', content } = parsed
  const ext = filename.split('.').pop() ?? type
  const mime = MIME[ext] ?? MIME.txt

  const handleDownload = () => {
    const BOM = ext === 'csv' ? '﻿' : ''
    const blob = new Blob([BOM + content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 2000)
  }

  // 미리보기: 최대 8줄
  const preview = content.split('\n').slice(0, 8).join('\n')
  const hasMore = content.split('\n').length > 8

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden my-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-blue-500" />
          <p className="text-xs font-semibold text-gray-700">{filename}</p>
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
        >
          {downloaded
            ? <><Check size={11} /> 저장됨</>
            : <><Download size={11} /> 다운로드</>}
        </button>
      </div>

      {/* 미리보기 */}
      <div className="p-3">
        <pre className="text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap leading-relaxed font-mono bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
          {preview}
          {hasMore && <span className="text-gray-400">{'\n'}…</span>}
        </pre>
      </div>
    </div>
  )
}
