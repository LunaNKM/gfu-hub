/**
 * OpenAI Function Calling — 도구 정의 + 실행기
 *
 * AI가 질문을 보고 스스로 어떤 도구를 쓸지 결정한다.
 * 기존 키워드 기반 라우팅(routeQuery / isScanAllQuery / isListingQuery)을 대체.
 */

import { ChatCompletionTool, ChatCompletionMessageToolCall } from 'openai/resources'
import { searchRelevantDocs, summarizeForListing, scanAllDocTitles } from './rag'
import { webSearch } from './websearch'

// ── 도구 정의 ─────────────────────────────────────────────────
export const TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_internal_docs',
      description:
        '사내 문서(캠페인, 프로젝트, 클라이언트, 계약, 인플루언서 정보 등)에서 정보를 검색합니다. ' +
        '회사 내부 데이터, 과거 진행 사례, 특정 브랜드·캠페인 정보가 필요할 때 사용하세요.',
      parameters: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string',
            description: '검색어',
          },
          mode: {
            type: 'string',
            enum: ['search', 'list', 'scan_all'],
            description:
              'search: 특정 정보 정밀 검색 | list: 관련 문서 목록 조회 | scan_all: 전체 문서 스캔(모든 캠페인·문서 리스트업)',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        '인터넷에서 최신 정보를 검색합니다. 트렌드, 시장 동향, 경쟁사, 최신 뉴스, 일본 SNS 현황 등 ' +
        '실시간 외부 정보가 필요할 때 사용하세요.',
      parameters: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string',
            description: '검색어',
          },
        },
        required: ['query'],
      },
    },
  },
]

// ── 도구 실행 결과 타입 ───────────────────────────────────────
export interface ToolExecutionResult {
  messages: { role: 'tool'; tool_call_id: string; content: string }[]
  ragSources: { docId: string; title: string; score: number }[]
  planText: string
  searchSummary: string
}

// ── 도구 실행기 ───────────────────────────────────────────────
export async function executeToolCalls(
  calls: ChatCompletionMessageToolCall[]
): Promise<ToolExecutionResult> {
  const messages: { role: 'tool'; tool_call_id: string; content: string }[] = []
  const ragSources: { docId: string; title: string; score: number }[] = []
  const searchSummaryParts: string[] = []

  // 병렬 실행
  await Promise.all(
    calls.map(async (call) => {
      let content = ''
      try {
        const args = JSON.parse(call.function.arguments) as { query: string; mode?: string }

        if (call.function.name === 'search_internal_docs') {
          const mode = args.mode ?? 'search'

          if (mode === 'scan_all') {
            const titles = await scanAllDocTitles()
            const titleList = titles
              .map((d, i) => `${i + 1}. [${d.title}] ${d.snippet}`)
              .join('\n')
            content = `# 사내 전체 문서 목록 (${titles.length}건)\n\n${titleList}`
            searchSummaryParts.push(`전체 문서 ${titles.length}건 스캔`)

          } else if (mode === 'list') {
            const sources = await summarizeForListing(args.query, 8, 500)
            content =
              sources.length > 0
                ? sources
                    .map((s, i) => `### [사내문서 ${i + 1}] ${s.title}\n${s.content}`)
                    .join('\n\n')
                : '관련 문서를 찾지 못했습니다.'
            sources.forEach((s) => ragSources.push({ docId: s.docId, title: s.title, score: s.score }))
            searchSummaryParts.push(`사내 문서 ${sources.length}건`)

          } else {
            const sources = await searchRelevantDocs(args.query, 10, 0.15)
            content =
              sources.length > 0
                ? sources
                    .map((s, i) => `### [사내문서 ${i + 1}] ${s.title}\n${s.content}`)
                    .join('\n\n')
                : '관련 문서를 찾지 못했습니다.'
            sources.forEach((s) => ragSources.push({ docId: s.docId, title: s.title, score: s.score }))
            searchSummaryParts.push(`사내 문서 ${sources.length}건`)
          }

        } else if (call.function.name === 'web_search') {
          const webResult = await webSearch(args.query)
          const parts: string[] = []
          if (webResult.answer) parts.push(`## 요약\n${webResult.answer}`)
          if (webResult.results.length > 0) {
            parts.push(
              webResult.results
                .map((r, i) => `### [웹자료 ${i + 1}] ${r.title}\n출처: ${r.url}\n${r.content}`)
                .join('\n\n')
            )
          }
          content = parts.join('\n\n') || '검색 결과 없음'
          searchSummaryParts.push(`웹 조사 ${webResult.results.length}건`)
        }
      } catch (err) {
        console.error(`Tool ${call.function.name} 실패:`, err)
        content = '도구 실행 중 오류가 발생했습니다.'
      }

      messages.push({ role: 'tool' as const, tool_call_id: call.id, content: content || '결과 없음' })
    })
  )

  return {
    messages,
    ragSources,
    planText: derivePlanText(calls),
    searchSummary:
      searchSummaryParts.length > 0
        ? `✅ ${searchSummaryParts.join(', ')} 확인 완료. 답변 생성 중...`
        : '',
  }
}

// ── 도구 선택에서 plan 메시지 생성 ──────────────────────────
function derivePlanText(calls: ChatCompletionMessageToolCall[]): string {
  const names = calls.map((c) => c.function.name)
  const hasInternal = names.includes('search_internal_docs')
  const hasWeb = names.includes('web_search')

  if (hasInternal && hasWeb) {
    return '📂🔍 사내 자료와 최신 외부 데이터를 함께 조합하여 전략을 구성합니다.'
  }
  if (hasInternal) {
    try {
      const args = JSON.parse(
        calls.find((c) => c.function.name === 'search_internal_docs')!.function.arguments
      ) as { mode?: string }
      if (args.mode === 'scan_all') return '📂 전체 문서를 스캔하여 목록을 수집합니다.'
      if (args.mode === 'list') return '📂 관련 문서 전체 범위를 탐색하여 목록을 수집합니다.'
    } catch { /* ignore */ }
    return '📂 사내 문서에서 관련 자료를 검색합니다.'
  }
  if (hasWeb) return '🔍 최신 데이터를 조사하여 근거 있는 답변을 구성합니다.'
  return '💬 질문을 분석합니다.'
}
