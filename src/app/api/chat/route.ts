import { NextRequest } from 'next/server'
import { getOpenAIClient, OPENAI_MODEL } from '@/lib/openai/client'
import { searchRelevantDocs } from '@/lib/openai/rag'
import { webSearch } from '@/lib/openai/websearch'
import { logAiUsage } from '@/lib/services/usage'

export const maxDuration = 60

// ── 질문 라우팅 ────────────────────────────────────────────────
function routeQuery(message: string): {
  needsRag: boolean
  needsWebSearch: boolean
  planText: string
} {
  const msg = message.toLowerCase()

  const internalKeywords = [
    '우리', '회사', '사내', '내부', '지난', '이전', '저번', '예전',
    '캠페인', '프로젝트', '클라이언트', '진행', '결과', '보고', '우리팀',
    '지금까지', '했던', '했었', '진행했', '작업했',
  ]
  const strategyKeywords = [
    '전략', '기획', '제안', '방향', '어떻게', '방법', '트렌드', '분석',
    '시장', '경쟁', '최신', '현황', '인사이트', '추천', '알려줘',
  ]
  const japanKeywords = [
    '일본', 'japan', 'jp', '도쿄', '오사카', '일본어',
    '인플루언서', 'sns', '인스타', '틱톡', '유튜브', 'line', 'x트위터',
  ]

  const isInternal = internalKeywords.some((k) => msg.includes(k))
  const isStrategy = strategyKeywords.some((k) => msg.includes(k))
  const isJapan = japanKeywords.some((k) => msg.includes(k))

  if (isInternal && !isStrategy) {
    return {
      needsRag: true,
      needsWebSearch: false,
      planText: '📂 사내 문서에서 관련 자료를 검색합니다.',
    }
  }

  if (isStrategy && isJapan) {
    return {
      needsRag: isInternal,
      needsWebSearch: true,
      planText: '🔍 일본 마케팅 최신 동향을 조사하고' + (isInternal ? ' 사내 자료와 함께' : '') + ' 전략을 구성합니다.',
    }
  }

  if (isStrategy) {
    return {
      needsRag: isInternal,
      needsWebSearch: true,
      planText: '🔍 최신 데이터를 조사하고' + (isInternal ? ' 사내 자료와 함께' : '') + ' 근거 있는 전략을 구성합니다.',
    }
  }

  return {
    needsRag: true,
    needsWebSearch: false,
    planText: '💬 질문을 분석하고 최적의 답변을 준비합니다.',
  }
}

// ── 시스템 프롬프트 빌더 ───────────────────────────────────────
function buildSystemPrompt(
  ragSources: { title: string; content: string }[],
  webResults: { title: string; url: string; content: string }[],
  webAnswer: string | null
): string {
  const base = `당신은 GFutures의 마케팅 전략 전문 AI 어시스턴트입니다.
특히 일본 디지털 마케팅 분야의 최고 전문가입니다.

[전문 분야]
- 일본 SNS 마케팅 (Instagram, TikTok, LINE, X(Twitter), YouTube)
- 일본 인플루언서 마케팅 (캐스팅, 캠페인 기획, KPI 설정, ROI 측정)
- 일본 소비자 심리와 문화적 맥락 (혼네/타테마에, 집단주의, 신뢰 문화)
- K-콘텐츠·K-뷰티의 일본 시장 진입 전략
- 한일 크로스보더 마케팅 캠페인

[답변 원칙]
1. 전략 기획 질문: 학습 데이터에만 의존하지 말고, 제공된 조사 결과를 반드시 활용하라.
2. 일본 특수성: 일본 문화·소비자 행동·플랫폼 특성을 항상 반영하라.
3. 실행 가능성: 이론보다 구체적 액션 아이템과 실행 방법을 제시하라.
4. 근거 기반: 수치, 통계, 구체적 사례로 반드시 뒷받침하라.
5. 구조화: 마크다운으로 명확하게 구조화하라.
6. 한국어로 답변하라.`

  let context = ''

  if (ragSources.length > 0) {
    context += '\n\n---\n## 📂 관련 사내 문서\n'
    context += ragSources
      .map((s) => `### ${s.title}\n${s.content}`)
      .join('\n\n')
  }

  if (webAnswer) {
    context += `\n\n---\n## 🔍 웹 조사 요약\n${webAnswer}`
  }

  if (webResults.length > 0) {
    context += '\n\n---\n## 🌐 웹 조사 상세 결과\n'
    context += webResults
      .map((r) => `**${r.title}** (${r.url})\n${r.content}`)
      .join('\n\n')
  }

  if (context) {
    return base + '\n\n[참고 자료 - 반드시 활용하여 답변할 것]' + context
  }

  return base
}

// ── 메인 핸들러 (SSE 스트리밍) ────────────────────────────────
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '인증이 필요합니다.' }), { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { conversationId, message, history = [], ragEnabled = true } = body

  if (!message) {
    return new Response(JSON.stringify({ error: '메시지가 없습니다.' }), { status: 400 })
  }

  const client = getOpenAIClient()
  if (!client) {
    return new Response(JSON.stringify({ error: 'OpenAI API 키가 설정되지 않았습니다.' }), { status: 503 })
  }

  const encoder = new TextEncoder()
  const send = (data: object) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`)

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 1단계: 라우팅 결정 및 계획 출력
        const routing = ragEnabled
          ? routeQuery(message)
          : { needsRag: false, needsWebSearch: false, planText: '💬 질문을 분석합니다.' }

        controller.enqueue(send({ type: 'plan', content: routing.planText }))

        // 2단계: 병렬 검색
        const [ragSources, webResult] = await Promise.all([
          routing.needsRag ? searchRelevantDocs(message, 5) : Promise.resolve([]),
          routing.needsWebSearch ? webSearch(message) : Promise.resolve({ answer: null, results: [] }),
        ])

        // 검색 완료 알림
        const searchSummary: string[] = []
        if (ragSources.length > 0) searchSummary.push(`사내 문서 ${ragSources.length}건`)
        if (webResult.results.length > 0) searchSummary.push(`웹 조사 ${webResult.results.length}건`)
        if (searchSummary.length > 0) {
          controller.enqueue(send({ type: 'search_done', content: `✅ ${searchSummary.join(', ')} 확인 완료. 답변 생성 중...` }))
        }

        // 3단계: 시스템 프롬프트 구성
        const systemPrompt = buildSystemPrompt(ragSources, webResult.results, webResult.answer)

        // 4단계: 대화 히스토리 (최근 10개)
        const historyMessages = (history as { role: string; content: string }[])
          .slice(-10)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

        // 5단계: OpenAI 스트리밍 호출
        const openaiStream = await client.chat.completions.create({
          model: OPENAI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            ...historyMessages,
            { role: 'user', content: message },
          ],
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: 4000,
        })

        let inputTokens = 0
        let outputTokens = 0

        for await (const chunk of openaiStream) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            controller.enqueue(send({ type: 'chunk', content }))
          }
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? 0
            outputTokens = chunk.usage.completion_tokens ?? 0
          }
        }

        const tokenUsage = {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        }

        // 사용량 로그
        try {
          const token = authHeader.replace('Bearer ', '')
          const parts = token.split('.')
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))
            const userId = payload.user_id || payload.sub || payload.uid
            if (userId) {
              await logAiUsage({
                userId,
                conversationId,
                model: OPENAI_MODEL,
                inputTokens,
                outputTokens,
                totalTokens: tokenUsage.totalTokens,
                feature: 'chat',
                success: true,
              })
            }
          }
        } catch {
          // 로그 실패 무시
        }

        controller.enqueue(
          send({
            type: 'done',
            ragSources: ragSources.map((s) => ({ docId: s.docId, title: s.title, score: s.score })),
            tokenUsage,
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
