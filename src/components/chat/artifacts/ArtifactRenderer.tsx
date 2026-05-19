'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChartArtifact } from './ChartArtifact'
import { MetricsArtifact } from './MetricsArtifact'
import { FileArtifact } from './FileArtifact'

interface Part {
  type: 'text' | 'artifact'
  content: string
  artifactType?: string
}

function parseMessageParts(content: string): Part[] {
  const parts: Part[] = []
  // ```artifact-xxx ... ``` 블록 감지
  const regex = /```artifact-([\w-]+)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim()
      if (text) parts.push({ type: 'text', content: text })
    }
    parts.push({ type: 'artifact', artifactType: match[1], content: match[2].trim() })
    lastIndex = match.index + match[0].length
  }

  const remaining = content.slice(lastIndex).trim()
  if (remaining) parts.push({ type: 'text', content: remaining })

  return parts
}

const PROSE =
  'prose prose-sm max-w-none ' +
  'prose-headings:font-bold prose-headings:text-gray-900 ' +
  'prose-h1:text-base prose-h2:text-sm prose-h3:text-sm ' +
  'prose-p:text-gray-800 prose-p:my-1 ' +
  'prose-strong:text-gray-900 prose-strong:font-semibold ' +
  'prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 ' +
  'prose-blockquote:text-gray-500 prose-blockquote:border-gray-300 ' +
  'prose-code:text-blue-600 prose-code:bg-blue-50 prose-code:px-1 prose-code:rounded ' +
  'prose-table:text-xs prose-td:px-2 prose-td:py-1 prose-th:px-2 prose-th:py-1'

export function ArtifactRenderer({ content }: { content: string }) {
  const parts = parseMessageParts(content)

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return (
            <div key={i} className={PROSE}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>
            </div>
          )
        }

        switch (part.artifactType) {
          case 'chart':
            return <ChartArtifact key={i} raw={part.content} />
          case 'metrics':
            return <MetricsArtifact key={i} raw={part.content} />
          case 'file':
            return <FileArtifact key={i} raw={part.content} />
          default:
            // 알 수 없는 아티팩트는 코드 블록으로 폴백
            return (
              <pre key={i} className="text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto my-2">
                {part.content}
              </pre>
            )
        }
      })}
    </>
  )
}
