import { NextRequest } from 'next/server'
import { getOpenAIClient, OPENAI_MODEL } from '@/lib/openai/client'
import { searchRelevantDocs, searchAllChunksFromTopDocs, scanAllDocTitles } from '@/lib/openai/rag'
import { webSearch } from '@/lib/openai/websearch'
import { logAiUsage } from '@/lib/services/usage'

export const maxDuration = 60

// ── 질문 라우팅 ────────────────────────────────────────────────
function routeQuery(message: string): {
  needsRag: boolean
  needsWebSearch: boolean
  isStrategy: boolean
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
      isStrategy: false,
      planText: '💬 질문을 분석합니다.',
    }
  }

  if (isInternal && !isWeb && !isStrategy) {
    return {
      needsRag: true,
      needsWebSearch: false,
      isStrategy: false,
      planText: '📂 사내 문서에서 관련 자료를 검색합니다.',
    }
  }

  if ((isWeb || isStrategy) && !isInternal) {
    return {
      needsRag: false,
      needsWebSearch: true,
      isStrategy: true,
      planText: '🔍 최신 데이터를 조사하여 근거 있는 답변을 구성합니다.',
    }
  }

  // 사내 + 외부 모두 필요
  return {
    needsRag: true,
    needsWebSearch: isWeb || isStrategy,
    isStrategy: true,
    planText: '📂🔍 사내 자료와 최신 외부 데이터를 함께 조합하여 전략을 구성합니다.',
  }
}

// ── 전수 스캔 감지: 범위가 "전체 문서"인 광범위 조회 ───────────
// 유사도 검색 대신 모든 문서 제목+스니펫을 스캔 → 커버리지 100%, 토큰 최소화
function isScanAllQuery(message: string): boolean {
  const msg = message.toLowerCase()
  const broadScope = ['모든', '전체', '전부', '다 알려', '다 보여', '리스트업', '목록으로', '모두 알려', '모두 보여', '전부 알려', '전부 보여']
  const topics = ['캠페인', '문서', '자료', '프로젝트', '클라이언트', '브랜드', '인플루언서', '계약']
  return broadScope.some((b) => msg.includes(b)) && topics.some((t) => msg.includes(t))
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

// ── 동적 컨텍스트 블록 빌더 ──────────────────────────────────
// RAG/웹 결과를 유저 메시지에 첨부 → 시스템 메시지는 항상 동일하게 유지
function buildContextBlock(
  ragSources: { title: string; content: string }[],
  webResults: { title: string; url: string; content: string }[],
  webAnswer: string | null
): string {
  const hasSources = ragSources.length > 0 || webResults.length > 0 || !!webAnswer
  if (!hasSources) return ''

  let context = '# 참고 자료\n\n> ⚠️ 아래 자료를 최우선으로 활용하여 답변하라. 자료에 있는 내용은 반드시 인용하고, 자료에 없는 내용은 없다고 밝혀라.\n'

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

  return context
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
          : { needsRag: false, needsWebSearch: false, isStrategy: false, planText: '💬 질문을 분석합니다.' }

        const isScanAll = ragEnabled && isScanAllQuery(message)
        const isListing = !isScanAll && ragEnabled && isListingQuery(message)

        controller.enqueue(send({
          type: 'plan',
          content: isScanAll
            ? '📂 전체 문서를 스캔하여 목록을 수집합니다.'
            : isListing
              ? '📂 관련 문서 전체 범위를 탐색하여 목록을 수집합니다.'
              : routing.planText,
        }))

        // 2단계: 검색
        // 전수스캔: 모든 문서 제목+스니펫 (커버리지 100%, 토큰 최소)
        // 리스트: 상위 문서 청크 전량
        // 일반: 유사도 상위 N개
        let ragSources: { docId: string; title: string; content: string; score: number }[] = []
        let scanTitles: { docId: string; title: string; snippet: string }[] = []

        const [, webResult] = await Promise.all([
          (async () => {
            if (isScanAll) {
              scanTitles = await scanAllDocTitles()
            } else if (isListing) {
              ragSources = await searchAllChunksFromTopDocs(message, 5, 40)
            } else if (routing.needsRag) {
              ragSources = await searchRelevantDocs(message, 10, 0.15)
            }
          })(),
          routing.needsWebSearch ? webSearch(message) : Promise.resolve({ answer: null, results: [] }),
        ])

        // 검색 완료 알림
        const searchSummary: string[] = []
        if (isScanAll) searchSummary.push(`전체 문서 ${scanTitles.length}건 스캔`)
        else if (ragSources.length > 0) searchSummary.push(`사내 문서 ${ragSources.length}건`)
        if (webResult.results.length > 0) searchSummary.push(`웹 조사 ${webResult.results.length}건`)
        if (searchSummary.length > 0) {
          controller.enqueue(send({ type: 'search_done', content: `✅ ${searchSummary.join(', ')} 확인 완료. 답변 생성 중...` }))
        }

        // 3단계: 컨텍스트 블록 구성
        // 전수스캔은 제목+스니펫만 전달 → 토큰 최소화
        let userContent: string
        if (isScanAll && scanTitles.length > 0) {
          const titleList = scanTitles
            .map((d, i) => `${i + 1}. [${d.title}] ${d.snippet}`)
            .join('\n')
          userContent = `# 사내 전체 문서 목록 (제목 + 요약)\n\n${titleList}\n\n---\n\n## 질문\n${message}`
        } else {
          const contextBlock = buildContextBlock(ragSources, webResult.results, webResult.answer)
          userContent = contextBlock
            ? `${contextBlock}\n\n---\n\n## 질문\n${message}`
            : message
        }

        // 4단계: 대화 히스토리 (최근 10개)
        const historyMessages = (history as { role: string; content: string }[])
          .slice(-6)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

        // 5단계: OpenAI 스트리밍 호출
        // 리스트: 12000 / 전략·기획: 2500 / 일반: 1500
        // 시스템 메시지 고정(BASE_SYSTEM_PROMPT) → OpenAI 자동 캐싱 적용
        const maxTokens = isListing ? 5000 : routing.isStrategy ? 1500 : 800

        const openaiStream = await client.chat.completions.create({
          model: OPENAI_MODEL,
          messages: [
            { role: 'system', content: BASE_SYSTEM_PROMPT },
            ...historyMessages,
            { role: 'user', content: userContent },
          ],
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: maxTokens,
        })

        let inputTokens = 0
        let outputTokens = 0
        let cachedTokens = 0

        for await (const chunk of openaiStream) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            controller.enqueue(send({ type: 'chunk', content }))
          }
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? 0
            outputTokens = chunk.usage.completion_tokens ?? 0
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cachedTokens = (chunk.usage as any).prompt_tokens_details?.cached_tokens ?? 0
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
                cachedTokens,
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
