import { NextRequest } from 'next/server'
import { getOpenAIClient, OPENAI_MODEL } from '@/lib/openai/client'
import { searchRelevantDocs, searchAllChunksFromTopDocs } from '@/lib/openai/rag'
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

  // 사내 데이터가 필요한 신호 — 과거·우리·특정 프로젝트 언급
  const internalSignals = [
    '우리', '회사', '사내', '내부', '지난', '이전', '저번', '예전', '기존',
    '캠페인', '프로젝트', '클라이언트', '진행', '결과', '보고', '우리팀',
    '지금까지', '했던', '했었', '진행했', '작업했', '담당', '계약', '제안서',
    '인플루언서', '섭외', '집행', '예산', '실적', '성과', '리스트', '목록',
    '정리해', '찾아줘', '알려줘', '뭐야', '뭐였', '어떻게 됐',
  ]

  // 최신 외부 정보가 필요한 신호 — 트렌드·시장·경쟁
  const webSignals = [
    '트렌드', '최신', '요즘', '올해', '2024', '2025', '2026',
    '시장', '경쟁사', '업계', '현황', '동향', '뉴스',
    '알고리즘', '변경', '업데이트', '새로운',
  ]

  // 전략·기획 — 두 소스를 모두 활용해야 가장 좋은 답변
  const strategySignals = [
    '전략', '기획', '제안', '방향', '어떻게 하면', '방법', '어떻게 해야',
    '분석', '인사이트', '추천', '개선', '아이디어', '플랜',
  ]

  const isInternal = internalSignals.some((k) => msg.includes(k))
  const isWeb = webSignals.some((k) => msg.includes(k))
  const isStrategy = strategySignals.some((k) => msg.includes(k))

  // 단순 대화·일반 질문 — 검색 불필요
  const isSimpleChat = !isInternal && !isWeb && !isStrategy

  if (isSimpleChat) {
    return {
      needsRag: false,
      needsWebSearch: false,
      planText: '💬 질문을 분석합니다.',
    }
  }

  if (isInternal && !isWeb && !isStrategy) {
    return {
      needsRag: true,
      needsWebSearch: false,
      planText: '📂 사내 문서에서 관련 자료를 검색합니다.',
    }
  }

  if ((isWeb || isStrategy) && !isInternal) {
    return {
      needsRag: false,
      needsWebSearch: true,
      planText: '🔍 최신 데이터를 조사하여 근거 있는 답변을 구성합니다.',
    }
  }

  // 사내 + 외부 모두 필요
  return {
    needsRag: true,
    needsWebSearch: isWeb || isStrategy,
    planText: '📂🔍 사내 자료와 최신 외부 데이터를 함께 조합하여 전략을 구성합니다.',
  }
}

// ── 리스트·열거 질문 감지 ──────────────────────────────────────
function isListingQuery(message: string): boolean {
  const msg = message.toLowerCase()
  const listingSignals = [
    '정리해', '정리 해', '목록', '리스트', '전부', '전체', '모두', '모든',
    '다 알려', '다 보여', '나열', '열거', '몇 명', '몇명', '몇 개', '몇개',
    '있어?', '있나?', '있나요', '있었나', '있었어', '어떤 것들',
    '어떤 인플루언서', '누가 있', '누구누구', '어디어디',
  ]
  return listingSignals.some((k) => msg.includes(k))
}

// ── 시스템 프롬프트 빌더 ───────────────────────────────────────
function buildSystemPrompt(
  ragSources: { title: string; content: string }[],
  webResults: { title: string; url: string; content: string }[],
  webAnswer: string | null
): string {
  const hasSources = ragSources.length > 0 || webResults.length > 0 || !!webAnswer

  const base = `# 정체성 및 역할

당신은 **GFutures AI**입니다. GFutures는 한국 기반의 일본 디지털 마케팅 전문 에이전시이며, 당신은 이 회사의 전략 파트너 AI입니다.

당신의 핵심 역량:
- 일본 SNS 마케팅 (Instagram, TikTok, LINE, X(Twitter), YouTube)
- 일본 인플루언서 마케팅 전반 (캐스팅, 캠페인 기획, KPI 설정, ROI 분석)
- 일본 소비자 심리 및 문화 맥락 (혼네/타테마에, 신뢰 기반 소비, 집단주의)
- K-콘텐츠·K-뷰티의 일본 시장 진입 전략
- 한일 크로스보더 캠페인 기획 및 실행

---

# 사고 방식 (Reasoning Protocol)

답변을 생성하기 전에 반드시 아래 순서로 판단하라.

1. **질문 의도 파악**: 사용자가 진짜로 원하는 것이 무엇인지 파악한다. 표면적 질문 뒤에 있는 실제 필요를 읽어라.
2. **정보 우선순위 결정**: 아래 우선순위에 따라 사용할 정보를 결정한다.
   - 1순위: 제공된 사내 문서 (가장 신뢰할 수 있는 실제 데이터)
   - 2순위: 제공된 웹 조사 결과 (최신 외부 정보)
   - 3순위: 학습된 일반 지식 (사내 문서·웹 조사로 보완되지 않은 영역에만)
3. **정보 공백 인식**: 사내 문서에 관련 정보가 없다면, 없다고 명확히 밝히고 추론임을 표시하라.
4. **답변 깊이 설정**: 질문의 복잡도에 비례해 답변 길이를 결정한다. 간단한 질문에 장황하게 답하지 마라.

---

# 답변 품질 기준

## 반드시 지킬 것
- **결론 우선**: 핵심 답변을 맨 앞에 배치하고, 근거와 세부 내용은 그 뒤에 전개한다.
- **수치 기반**: 전략·분석 답변은 수치, 통계, 구체적 사례로 반드시 뒷받침한다. 수치 없는 주장은 "(추정)" 또는 "(일반적 경향)"으로 표시한다.
- **실행 가능성**: 이론이나 프레임워크 나열로 끝내지 말고, 내일 당장 실행 가능한 액션 아이템을 포함한다.
- **일본 맥락 반영**: 마케팅 전략 답변은 일본 특유의 소비자 행동·플랫폼 문화·규제 환경을 항상 반영한다.
- **출처 명시**: 사내 문서에서 가져온 내용은 "사내 자료에 따르면", 웹 조사 결과는 "최신 조사 결과" 또는 출처 URL을 함께 표시한다.

## 절대 하지 말 것
- 모른다는 사실을 숨기거나, 모르는 내용을 아는 척 지어내는 것
- "~할 수 있습니다", "~하는 것이 좋을 것 같습니다" 같은 불필요한 완충 표현 남발
- 질문과 무관한 일반론 전개
- 동일한 내용을 다른 표현으로 반복하는 패딩
- 사용자가 이미 아는 배경 설명을 장황하게 서술

---

# 정보 공백 처리 원칙

사내 문서에서 요청한 정보를 찾지 못한 경우:
1. "사내 문서에서 해당 내용을 찾지 못했습니다."라고 먼저 명확히 밝힌다.
2. 그 다음, 보유한 일반 지식을 기반으로 답변하되 "(일반 지식 기반)" 또는 "(추정)"으로 표시한다.
3. 필요시 "해당 정보가 Google Drive에 동기화되어 있는지 확인해보세요."라고 안내한다.

---

# 출력 형식 규칙

| 질문 유형 | 형식 |
|---|---|
| 전략·기획 | 헤더(##) 구분, 핵심 요약 먼저, 표/리스트 적극 활용 |
| 데이터 정리·요약 | 표 우선, 없으면 번호 목록 |
| 단답형 질문 | 마크다운 없이 간결하게 |
| 비교·분석 | 반드시 표로 정리 |
| 액션 플랜 | 번호 목록 + 각 항목에 담당·기한·기대효과 포함 |

모든 답변은 한국어로 작성한다. 단, 일본어 고유명사(플랫폼명, 브랜드명, 문화 용어)는 원어 병기한다.`

  let context = ''

  if (hasSources) {
    context += '\n\n---\n\n# 참고 자료\n\n> ⚠️ 아래 자료를 최우선으로 활용하여 답변하라. 자료에 있는 내용은 반드시 인용하고, 자료에 없는 내용은 없다고 밝혀라.\n'
  }

  if (ragSources.length > 0) {
    context += '\n## 📂 사내 문서\n'
    context += ragSources
      .map((s, i) => `### [사내문서 ${i + 1}] ${s.title}\n${s.content}`)
      .join('\n\n')
  }

  if (webAnswer) {
    context += `\n\n## 🔍 웹 조사 요약\n${webAnswer}`
  }

  if (webResults.length > 0) {
    context += '\n\n## 🌐 웹 조사 상세\n'
    context += webResults
      .map((r, i) => `### [웹자료 ${i + 1}] ${r.title}\n출처: ${r.url}\n${r.content}`)
      .join('\n\n')
  }

  return base + context
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

        const isListing = ragEnabled && isListingQuery(message)

        controller.enqueue(send({
          type: 'plan',
          content: isListing
            ? '📂 관련 문서 전체 범위를 탐색하여 목록을 수집합니다.'
            : routing.planText,
        }))

        // 2단계: 병렬 검색
        // 리스트 질문이면 상위 문서의 청크를 전량 수집, 일반 질문은 유사도 상위 N개
        const [ragSources, webResult] = await Promise.all([
          isListing
            ? searchAllChunksFromTopDocs(message, 8, 80)
            : routing.needsRag
              ? searchRelevantDocs(message, 20, 0.03)
              : Promise.resolve([]),
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
        // 리스트 질문은 출력이 길어지므로 토큰 한도를 늘린다
        const maxTokens = isListing ? 12000 : 4000

        const openaiStream = await client.chat.completions.create({
          model: OPENAI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            ...historyMessages,
            { role: 'user', content: message },
          ],
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: maxTokens,
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
          const jwtToken = authHeader.replace('Bearer ', '')
          const parts = jwtToken.split('.')
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))
            const userId = payload.user_id || payload.sub || payload.uid
            const userEmail = payload.email ?? undefined
            if (userId) {
              await logAiUsage({
                userId,
                userEmail,
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
        } catch (logErr) {
          console.error('사용량 로그 실패:', logErr)
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
