import { NextRequest } from 'next/server'
import { getOpenAIClient, OPENAI_MODEL, TOOL_DECISION_MODEL } from '@/lib/openai/client'
import { TOOLS, executeToolCalls } from '@/lib/openai/tools'
import { logAiUsage } from '@/lib/services/usage'
import { getRelevantMemories } from '@/lib/services/memory'

export const maxDuration = 60

// ── 정적 시스템 프롬프트 (모듈 상수) ─────────────────────────
// 매 요청에서 동일하게 유지 → OpenAI 자동 프롬프트 캐싱 활성화 (1024+ 토큰)
const BASE_SYSTEM_PROMPT = `# 역할

당신은 **GFutures AI**다. GFutures는 한국 기반 일본 디지털 마케팅 전문 에이전시이며, 당신은 이 회사의 전략 파트너 AI다.
핵심 역량: 일본 SNS·인플루언서 마케팅, 일본 소비자 심리, K-뷰티 일본 진출, 한일 크로스보더 캠페인.

---

# 답변 구조 (반드시 준수)

**모든 답변은 아래 3단 구조를 따른다:**

1. **핵심 결론 (3줄 이내)** — 가장 중요한 답을 먼저. 배경 설명 없이 바로 결론.
2. **근거 / 실행 방안** — 결론을 뒷받침하는 데이터·사내자료·구체적 액션만. 챕터는 최대 3개.
3. **다음 스텝 (선택)** — 필요한 경우만, 3줄 이내.

---

# 출력 길이 규칙 (엄수)

| 질문 유형 | 최대 분량 |
|---|---|
| 전략·기획 | **600단어** 이내. 초과 시 핵심만 남기고 삭제. |
| 데이터·목록 정리 | 항목 수에 비례, 표 형식 우선 |
| 단답·확인 질문 | 3문장 이내 |
| 비교·분석 | 표 1개 + 결론 2문장 |

**600단어를 초과할 것 같으면 섹션을 줄여라. 절대 잘리지 않게 완결된 답변을 내놓아라.**

---

# 정보 우선순위

1순위: 사내 문서 → 2순위: 웹 조사 결과 → 3순위: 일반 지식(반드시 "(추정)" 표시)

사내 문서에 없는 내용: "사내 자료 없음. 아래는 일반 지식 기반."으로 한 줄 표시 후 계속.

---

# 금지 사항

- 같은 내용 반복 (다른 표현으로 패딩하는 것)
- "~할 수 있습니다", "~하는 것이 좋을 것 같습니다" 같은 완충 표현
- 사용자가 이미 알고 있을 배경 설명을 길게 서술
- 실행 불가능한 원론적 조언
- 제목만 있고 내용이 없는 빈 섹션

모든 답변은 한국어. 일본어 고유명사(플랫폼명·브랜드명)는 원어 병기.

---

# 아티팩트 출력 (시각화·파일)

텍스트보다 시각적으로 표현하면 더 유용한 경우, 아래 아티팩트 블록을 텍스트 답변 뒤에 추가한다.

## 차트 (artifact-chart)
수치 데이터를 비교하거나 추이를 보여줄 때 사용.
type: "bar" | "line" | "area" | "pie"

\`\`\`artifact-chart
{
  "title": "채널별 예산 배분",
  "type": "bar",
  "data": [
    {"채널": "Instagram", "예산": 5000000},
    {"채널": "TikTok", "예산": 3000000}
  ],
  "xKey": "채널",
  "yKey": "예산"
}
\`\`\`

## 대시보드 (artifact-metrics)
KPI·핵심 수치를 카드 형태로 요약할 때 사용.
trend: "up" | "down" | "neutral"

\`\`\`artifact-metrics
{
  "title": "캠페인 KPI",
  "items": [
    {"label": "총 예산", "value": "₩8,000만", "sub": "Q2 집행", "trend": "neutral"},
    {"label": "인플루언서", "value": "25명", "sub": "확정 15명", "trend": "up"}
  ]
}
\`\`\`

## 파일 다운로드 (artifact-file)
표·계획서·데이터를 저장 가능한 파일로 제공할 때 사용.
type: "csv" | "markdown" | "json"

\`\`\`artifact-file
{
  "filename": "campaign_plan.csv",
  "type": "csv",
  "content": "채널,예산,기간\nInstagram,5000000,4~6월\nTikTok,3000000,4~6월"
}
\`\`\`

## 사용 규칙
- 숫자 3개 이상 비교 → artifact-chart
- KPI/요약 수치 → artifact-metrics
- 저장이 필요한 표·계획 → artifact-file
- 단순 텍스트로 충분하면 아티팩트 불필요
- 아티팩트는 텍스트 설명 뒤에 추가. 텍스트 없이 아티팩트만 출력 금지`

// ── 히스토리 정제 ─────────────────────────────────────────────
// 이전 방식의 RAG 컨텍스트 블록 + plan 프리픽스를 제거해 깔끔한 히스토리 유지
function cleanHistoryMessage(role: string, content: string): string {
  if (role === 'user') {
    // "# 참고 자료\n...\n\n---\n\n## 질문\n{실제질문}" → 실제 질문만 추출
    const marker = '\n\n---\n\n## 질문\n'
    const idx = content.indexOf(marker)
    if (idx !== -1) return content.slice(idx + marker.length)
    // "# 장기 기억\n...\n\n---\n\n{실제질문}" → 실제 질문만 추출
    const memMarker = '\n\n---\n\n'
    const memIdx = content.indexOf(memMarker)
    if (memIdx !== -1 && content.startsWith('# 장기 기억')) return content.slice(memIdx + memMarker.length)
  }
  if (role === 'assistant') {
    // "> plan text\n\n*status*\n\n실제응답" → 실제 응답만
    return content.replace(/^(>.*?\n\n)?(\*.*?\*\n\n)?/, '')
  }
  return content
}

// ── 메인 핸들러 (SSE 스트리밍) ────────────────────────────────
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '인증이 필요합니다.' }), { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { conversationId, message, history = [], ragEnabled = true } = body as {
    conversationId?: string
    message: string
    history: { role: string; content: string }[]
    ragEnabled: boolean
  }

  if (!message) {
    return new Response(JSON.stringify({ error: '메시지가 없습니다.' }), { status: 400 })
  }

  const client = getOpenAIClient()
  if (!client) {
    return new Response(JSON.stringify({ error: 'OpenAI API 키가 설정되지 않았습니다.' }), { status: 503 })
  }

  // JWT에서 userId 추출 (메모리 조회에 필요)
  let userId: string | null = null
  let userEmail: string | undefined
  try {
    const parts = authHeader.replace('Bearer ', '').split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))
      userId = payload.user_id || payload.sub || payload.uid || null
      userEmail = payload.email ?? undefined
    }
  } catch { /* ignore */ }

  const encoder = new TextEncoder()
  const send = (data: object) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`)

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── 히스토리 정제 (최근 6턴) ─────────────────────────
        const historyMessages = (history as { role: string; content: string }[])
          .slice(-6)
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: cleanHistoryMessage(m.role, m.content),
          }))

        // ── 장기 기억 조회 & 도구 선택 병렬 실행 ─────────────
        // 메모리 조회(Firestore + 임베딩)와 Function Calling을 동시에 시작
        // → 순차 실행 대비 둘 중 느린 쪽 시간만큼 절약
        controller.enqueue(send({ type: 'plan', content: '🔎 분석 중...' }))

        type ToolCallMessage = { role: 'assistant'; content: string | null; tool_calls?: import('openai/resources').ChatCompletionMessageToolCall[] }
        let toolCallMessage: ToolCallMessage | null = null
        let toolMessages: { role: 'tool'; tool_call_id: string; content: string }[] = []
        let ragSources: { docId: string; title: string; score: number }[] = []
        let toolInputTokens = 0
        let toolOutputTokens = 0
        let userContent = message // 메모리 없을 때 기본값

        if (ragEnabled) {
          try {
            // gpt-4.1-nano: 도구 선택은 단순 판단 → nano로 충분 (TTFT 0.6초 vs mini 7.5초)
            // 메모리 조회와 병렬 실행 — Promise.all로 동시 시작
            const [toolDecision, memories] = await Promise.all([
              client.chat.completions.create({
                model: TOOL_DECISION_MODEL,
                messages: [
                  { role: 'system', content: BASE_SYSTEM_PROMPT },
                  ...historyMessages,
                  { role: 'user', content: message }, // 메모리 미주입 상태로 도구 판단 (충분함)
                ],
                tools: TOOLS,
                tool_choice: 'auto',
                max_completion_tokens: 300,
              }),
              userId ? getRelevantMemories(userId, message, 3) : Promise.resolve([]),
            ])

            // 메모리 블록 구성 (병렬 완료 후) → userContent 업데이트
            if (memories.length > 0) {
              const memoryBlock = `# 장기 기억 (이전 대화에서 학습한 정보)\n${memories.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\n---\n\n`
              userContent = memoryBlock + message
            }

            toolInputTokens = toolDecision.usage?.prompt_tokens ?? 0
            toolOutputTokens = toolDecision.usage?.completion_tokens ?? 0
            toolCallMessage = toolDecision.choices[0].message as unknown as ToolCallMessage

            // ── 도구 실행 ─────────────────────────────────────
            if (toolCallMessage?.tool_calls?.length) {
              const result = await executeToolCalls(toolCallMessage.tool_calls)
              toolMessages = result.messages
              ragSources = result.ragSources

              controller.enqueue(send({ type: 'plan', content: result.planText }))
              if (result.searchSummary) {
                controller.enqueue(send({ type: 'search_done', content: result.searchSummary }))
              }
            } else {
              controller.enqueue(send({ type: 'plan', content: '💬 질문을 분석합니다.' }))
            }
          } catch (toolErr) {
            // Function Calling 실패 시 단순 응답으로 폴백
            console.warn('Function Calling 폴백:', toolErr)
            controller.enqueue(send({ type: 'plan', content: '💬 질문을 분석합니다.' }))
          }
        }

        // ── 5. 최종 응답 메시지 구성 ─────────────────────────
        const finalMessages: import('openai/resources').ChatCompletionMessageParam[] = [
          { role: 'system', content: BASE_SYSTEM_PROMPT },
          ...historyMessages,
          { role: 'user', content: userContent },
          ...(toolCallMessage?.tool_calls?.length
            ? [
                toolCallMessage as import('openai/resources').ChatCompletionMessageParam,
                ...toolMessages as import('openai/resources').ChatCompletionMessageParam[],
              ]
            : []),
        ]

        // ── 6. 출력 토큰 한도 결정 ───────────────────────────
        // 도구 선택 결과 기반으로 적절한 한도 설정
        const maxTokens = (() => {
          if (!toolCallMessage?.tool_calls?.length) return 800
          for (const call of toolCallMessage.tool_calls) {
            if (call.function.name === 'search_internal_docs') {
              const args = JSON.parse(call.function.arguments) as { mode?: string }
              if (args.mode === 'scan_all' || args.mode === 'list') return 2000
            }
            if (call.function.name === 'web_search') return 1500
          }
          return 1000
        })()

        // ── 7. 스트리밍 응답 ─────────────────────────────────
        const openaiStream = await client.chat.completions.create({
          model: OPENAI_MODEL,
          messages: finalMessages,
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: maxTokens,
        })

        let inputTokens = 0
        let outputTokens = 0
        let cachedTokens = 0

        for await (const chunk of openaiStream) {
          const content = chunk.choices[0]?.delta?.content
          if (content) controller.enqueue(send({ type: 'chunk', content }))
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? 0
            outputTokens = chunk.usage.completion_tokens ?? 0
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cachedTokens = (chunk.usage as any).prompt_tokens_details?.cached_tokens ?? 0
          }
        }

        // ── 8. 사용량 로그 (도구 선택 + 응답 토큰 합산) ─────
        if (userId) {
          try {
            await logAiUsage({
              userId,
              userEmail,
              conversationId,
              model: OPENAI_MODEL,
              inputTokens: inputTokens + toolInputTokens,
              outputTokens: outputTokens + toolOutputTokens,
              totalTokens: inputTokens + outputTokens + toolInputTokens + toolOutputTokens,
              cachedTokens,
              feature: 'chat',
              success: true,
            })
          } catch (logErr) {
            console.error('사용량 로그 실패:', logErr)
          }
        }

        controller.enqueue(
          send({
            type: 'done',
            ragSources,
            tokenUsage: {
              inputTokens: inputTokens + toolInputTokens,
              outputTokens: outputTokens + toolOutputTokens,
              totalTokens: inputTokens + outputTokens + toolInputTokens + toolOutputTokens,
            },
          })
        )
      } catch (err) {
        console.error('Chat API 오류:', err)
        controller.enqueue(send({ type: 'error', content: 'AI 응답 생성 중 오류가 발생했습니다.' }))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
