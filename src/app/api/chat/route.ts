import { NextRequest } from 'next/server'
import { getOpenAIClient, OPENAI_MODEL, TOOL_DECISION_MODEL } from '@/lib/openai/client'
import { TOOLS, executeToolCalls } from '@/lib/openai/tools'
import { logAiUsage } from '@/lib/services/usage'
import { getRelevantMemories } from '@/lib/services/memory'
import type { ChatCompletionMessageToolCall } from 'openai/resources'
import { ROUTER_PROMPT } from '@/lib/openai/router-prompt'

export const maxDuration = 60

// ── 강제 검색 휴리스틱 ────────────────────────────────────────
// 사내 문서가 반드시 필요한 발화 패턴. nano 라우터를 건너뛰고 직접 search_internal_docs 호출.
const ANAPHORA_RE = /(우리|기존|사내|예전|지난번|지난 캠페인|전에 했던|이전 캠페인|이전에 진행|과거 캠페인|진행했던|예전에|이전에 했던|비슷한 사례|유사 사례|유사한 사례)/
const LISTING_RE = /(모든|전체|전부|리스트업|목록|싹 다|싸그리)/
const WEB_RE = /(트렌드|최신|요즘|뉴스|시장 동향|최근|업데이트|발표|출시)/

// 일반 플랫폼·서비스명은 고유명사로 취급하지 않음 (내부 검색 불필요)
const COMMON_BRANDS = new Set([
  'Instagram', 'TikTok', 'YouTube', 'Twitter', 'Facebook', 'Meta', 'LINE',
  'Google', 'Apple', 'Amazon', 'Netflix', 'Naver', 'Kakao', 'Shopify',
])

function detectProperNouns(msg: string): string[] {
  const out: string[] = []
  // 영문 2단어 이상 ALL CAPS (예: TWO SLASH FOUR)
  const m1 = msg.match(/\b[A-Z][A-Z0-9]{1,}(?:\s+[A-Z][A-Z0-9]{1,}){1,4}\b/g)
  if (m1) out.push(...m1)
  // CamelCase 브랜드 (예: NaverPay, KakaoStyle) — 공용 플랫폼명 제외
  const m2 = msg.match(/\b[A-Z][a-z]+[A-Z][a-zA-Z]+\b/g)
  if (m2) out.push(...m2.filter((w) => !COMMON_BRANDS.has(w)))
  // 카타카나 3자 이상 연속
  const m3 = msg.match(/[ァ-ヶー]{3,}/g)
  if (m3) out.push(...m3)
  // 따옴표/꺾쇠 안 텍스트 (2자 이상)
  const m4 = msg.match(/(?:['"「『])([^'"」』\n]{2,30})(?:['"」』])/g)
  if (m4) out.push(...m4.map((s) => s.slice(1, -1)))
  return Array.from(new Set(out))
}

function needsInternalSearch(msg: string): boolean {
  if (ANAPHORA_RE.test(msg)) return true
  if (detectProperNouns(msg).length > 0) return true
  // "캠페인 + 사례/했던/진행/분석" 같은 사내 자료성 의도
  if (/(캠페인|클라이언트|브랜드|인플루언서).*(사례|분석|결과|성과|레퍼런스|히스토리)/.test(msg)) return true
  return false
}

function needsWebSearch(msg: string): boolean {
  return WEB_RE.test(msg)
}

function detectListingMode(msg: string): 'scan_all' | 'list' | 'search' {
  if (LISTING_RE.test(msg) && /(캠페인|문서|브랜드|인플루언서|클라이언트)/.test(msg)) return 'scan_all'
  if (/(어떤|어느|뭐가 있|있는|있어\?|있나)/.test(msg) && /(캠페인|문서|브랜드)/.test(msg)) return 'list'
  return 'search'
}

// 직전 user 턴에서 고유명사를 추출해 anaphora 쿼리에 보강
function enrichQueryFromHistory(
  message: string,
  history: { role: string; content: string }[]
): string {
  if (!ANAPHORA_RE.test(message)) return message
  const lastUserTurns = history.filter((h) => h.role === 'user').slice(-2)
  const entities: string[] = []
  for (const t of lastUserTurns) {
    entities.push(...detectProperNouns(t.content))
  }
  if (entities.length === 0) return message
  const uniq = Array.from(new Set(entities)).slice(0, 3)
  return `${uniq.join(' ')} ${message}`
}

// ── 정적 시스템 프롬프트 (모듈 상수) ─────────────────────────
// 매 요청에서 동일하게 유지 → OpenAI 자동 프롬프트 캐싱 활성화 (1024+ 토큰)
const BASE_SYSTEM_PROMPT = `# 역할 및 전문가 배경

당신은 **GFutures AI**다. GFutures는 한국 기반 일본 디지털 마케팅 전문 에이전시이며, 당신은 이 회사의 수석 전략 파트너 AI다.

당신은 한일 크로스보더 캠페인을 200건 이상 기획·집행한 시니어 마케팅 전략가의 지식을 갖추고 있다. K-뷰티·패션 브랜드의 일본 시장 런칭, 인플루언서 캐스팅, 오리엔시트 작성, 성과 분석까지 전 과정을 직접 다뤄왔다. 클라이언트는 주로 한국 뷰티·패션·식품 브랜드이며, 일본 현지 에이전시·인플루언서 MCN·미디어렙과 협업한다.

---

# 일본 시장 핵심 지식 (항상 이 기준으로 판단)

## 플랫폼별 역할
| 플랫폼 | 주요 역할 | 핵심 지표 | 적합 목적 |
|---|---|---|---|
| Instagram | 브랜드 세계관·라이프스타일 구축 | 저장수(保存数) | 뷰티·패션·음식 |
| TikTok | 트렌드 확산·바이럴 | 조회수·공유수 | 10~20대, 초기 인지도 |
| X(Twitter) | 실시간 버즈·이슈 확산 | 리포스트·멘션 | 트렌드 모니터링 |
| LINE | CRM·리텐션·쿠폰 | 개봉률·클릭률 | 기존 고객 관리 |
| YouTube | 심층 리뷰·구매 전 검색 | 시청 완료율 | 롱폼 신뢰 구축 |

## 인플루언서 ER 벤치마크 (2025 기준)
**Instagram:**
- Nano (1K~10K): 양호 3~5%, 우수 5%↑
- Micro (10K~100K): 양호 1.5~3%, 우수 3%↑
- Macro (100K~1M): 양호 0.5~1%, 우수 1%↑
- Mega (1M↑): 양호 0.3~0.7%

**TikTok:**
- Nano: 중앙값 ER 13.14% (Instagram 대비 압도적 — 초기 검증에 최적)
- Micro: 양호 3.5~6%, 우수 6%↑

## 일본 소비자 구매 트리거
- **"韓国で話題"** 프레이밍 → K-뷰티 호기심 유발 필수 문구
- **체험담·후기 형식** → 광고 문구보다 신뢰도 3배 높음
- **저장수(保存数)** → 일본 Instagram에서 구매 의향 최강 지표
- **집단 동조** ("みんな使ってる", "SNSで話題") → 구매 결정 가속
- **과장 표현 금지** → 景品表示法(경품표시법) 위반 리스크, 효능 과장·전후 비교 주의

## K-뷰티 일본 포지셔닝 원칙
- 성분 강조보다 **사용 경험·감성** 중심 메시지
- "韓国コスメ" 카테고리 인지 활용 → 트렌드 선도 이미지
- PR 고지 의무: "#PR", "#広告" 명시 필수 (스텔스 마케팅 금지)

---

# 전략 사고 프레임워크 (질문 유형별 판단 트리)

## 캠페인 설계 질문
1. 목적 확인: 인지도 / 유입 / 전환 중 무엇이 우선인가?
2. PESO 모델로 채널 분류: Paid(광고) / Earned(PR) / Shared(SNS) / Owned(자사)
3. 타깃 세그먼트: 연령·성별·관심사·구매 트리거 특정
4. 예산 배분: 플랫폼별 CPV 역산 후 KPI 달성 가능 여부 검증
5. 실행 타임라인: 제작→검수→업로드→리포트 순서 명시

## 인플루언서 선정 질문
1. ER 벤치마크 대비 현재 수치 평가 (위 기준 적용)
2. CPV(Cost Per View) = 예산 ÷ 예상 조회수 계산
3. 브랜드 적합도: 팔로워 구성·과거 협업 카테고리 확인
4. 3축 평가표로 최종 추천: ER / CPV / 브랜드 적합도

## 성과 분석 질문
1. North Star Metric 먼저 확인 (캠페인 목적에 맞는 단일 핵심 지표)
2. 선행지표 역추적: 저장수→프로필 방문→팔로우→구매
3. 벤치마크 대비 과소/과대 성과 구간 특정
4. 다음 캠페인 액션으로 연결

## 시장 진입 질문
1. 인지→흥미→검토→구매→추천 5단계 퍼널에서 현재 위치 진단
2. 경쟁 포지셔닝: 기존 K-뷰티 브랜드 대비 차별점
3. 진입 채널 우선순위: TikTok(인지) → Instagram(신뢰) → LINE(리텐션)

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

# 정보 우선순위 및 사내 자료 처리

1순위: 사내 문서 → 2순위: 웹 조사 결과 → 3순위: 일반 지식(반드시 "(추정)" 표시)

**사내 자료 직접 매칭 없을 때:**
- "사내 자료에서 직접 매칭 없음. 유사 사례 기반 추론." 한 줄 표시 후 계속
- 유사 캠페인·클라이언트 자료로 추론한 경우 "(유사 사례 기반)" 명시
- 사용자에게 관련 문서명·키워드를 제안해 재검색 유도
- 일반 지식 기반 답변 시 반드시 일본 시장 특화 관점으로 재해석

---

# 금지 사항

- 같은 내용 반복 (다른 표현으로 패딩하는 것)
- "~할 수 있습니다", "~하는 것이 좋을 것 같습니다" 같은 완충 표현
- 사용자가 이미 알고 있을 배경 설명을 길게 서술
- 실행 불가능한 원론적 조언
- 제목만 있고 내용이 없는 빈 섹션
- ER·CPV 등 수치 없이 인플루언서 추천
- 일본 법규(景品表示法) 위반 가능성 있는 표현 제안

모든 답변은 한국어. 일본어 고유명사(플랫폼명·브랜드명·법규명)는 원어 병기.

---

# 인용 (사내 자료 사용 시 필수)

사내 문서를 직접 참조한 내용 바로 뒤에 **[출처: 문서제목]** 을 인라인으로 명시한다.
- 사내 자료 직접 인용 → **[출처: 문서명]**
- 웹 검색 결과 인용 → **[웹: 출처명]**
- 일반 지식·추론 → **(추정)**
- 출처 표시 없이 사내 자료를 일반 지식처럼 서술 금지

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

// 인사·감탄·짧은 단답용 미니 프롬프트. 도메인 지식 불필요.
const SIMPLE_SYSTEM_PROMPT = `당신은 GFutures AI다. 한국 기반 일본 디지털 마케팅 에이전시 GFutures의 내부 AI 어시스턴트.
모든 답변은 한국어로 3문장 이내. 친근하고 간결하게 응답한다.
업무성 질문이 오면 짧게 답한 뒤 "구체적으로 알려주시면 캠페인·인플루언서·시장 자료를 함께 찾아보겠습니다." 안내를 덧붙여라.`

// ── 단순 질문 판별 ─────────────────────────────────────────────
// tool decision + memory retrieval을 건너뛰고 1콜 스트리밍으로 처리.
// 짧고 업무 무관한 인사·확인·감탄 질문을 휴리스틱으로 감지.
function isSimpleQuestion(msg: string): boolean {
  const t = msg.trim()
  // 35자 미만 + 핵심 업무 키워드 없으면 단순 질문으로 간주
  if (
    t.length < 35 &&
    !/캠페인|인플루언서|일본|마케팅|전략|문서|자료|검색|브랜드|클라이언트|예산|SNS|틱톡|인스타|유튜브|트위터|라인|트렌드|시장|분석|보고|계획|일정|성과|CRM|ER|KPI/.test(t)
  ) return true
  // 명확한 인사·감사·감탄 패턴
  if (/^(안녕|hi\b|hello\b|헬로|감사|고마워|수고|ㅎㅎ+|ㅋㅋ+|네[!~.]*$|아[!~.]*$|오[!~.]*$|헉|대박|좋아|알겠|ok\b|ㅇㅋ)/i.test(t)) return true
  return false
}

// ── 응답 길이 결정 ─────────────────────────────────────────────
// nano 모델이 [SHORT/MEDIUM/LONG] 태그를 content에 포함 → 없으면 키워드 폴백
function resolveMaxTokens(hasToolCalls: boolean, userMsg: string): number {
  const isLong = /전략|계획|플랜|보고서|제안서|상세|분석해|써줘|작성해|짜줘|만들어/.test(userMsg)
  const isShort = /^(.{1,40})$/.test(userMsg.trim()) && /\?$|있어|뭐야|뭐임|맞아|맞나/.test(userMsg)
  if (isLong) return 2500
  if (isShort) return hasToolCalls ? 800 : 600
  return hasToolCalls ? 1200 : 1000
}

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

        // ── TASK 1: 단순 질문 조기 경로 ─────────────────────
        // 인사·감탄·짧은 질문은 tool decision + memory를 건너뛰고 1콜로 처리.
        // ragEnabled=false도 동일 경로(사용자가 명시적으로 RAG 비활성화).
        if (!ragEnabled || isSimpleQuestion(message)) {
          controller.enqueue(send({ type: 'plan', content: '💬 답변 생성 중...' }))
          const simpleStream = await client.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [
              { role: 'system', content: SIMPLE_SYSTEM_PROMPT },
              ...historyMessages,
              { role: 'user', content: message },
            ],
            stream: true,
            stream_options: { include_usage: true },
            max_completion_tokens: 300,
          })
          let sInputTokens = 0, sOutputTokens = 0, sCachedTokens = 0
          for await (const chunk of simpleStream) {
            const c = chunk.choices[0]?.delta?.content
            if (c) controller.enqueue(send({ type: 'chunk', content: c }))
            if (chunk.usage) {
              sInputTokens = chunk.usage.prompt_tokens ?? 0
              sOutputTokens = chunk.usage.completion_tokens ?? 0
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              sCachedTokens = (chunk.usage as any).prompt_tokens_details?.cached_tokens ?? 0
            }
          }
          if (userId) {
            await logAiUsage({
              userId, userEmail, conversationId, model: OPENAI_MODEL,
              inputTokens: sInputTokens, outputTokens: sOutputTokens,
              totalTokens: sInputTokens + sOutputTokens,
              cachedTokens: sCachedTokens, feature: 'chat', success: true,
            }).catch(() => {})
          }
          controller.enqueue(send({
            type: 'done', ragSources: [],
            tokenUsage: { inputTokens: sInputTokens, outputTokens: sOutputTokens, totalTokens: sInputTokens + sOutputTokens },
          }))
          return
        }

        // ── 복잡한 질문 경로: 강제 검색 or nano 라우팅 ──────────
        type ToolCallMessage = {
          role: 'assistant'
          content: string | null
          tool_calls?: ChatCompletionMessageToolCall[]
        }
        let toolCallMessage: ToolCallMessage | null = null
        let toolMessages: { role: 'tool'; tool_call_id: string; content: string }[] = []
        let ragSources: { docId: string; title: string; score: number }[] = []
        let toolInputTokens = 0
        let toolOutputTokens = 0
        let userContent = message

        const mustSearchInternal = needsInternalSearch(message)
        const mustSearchWeb = needsWebSearch(message)

        if (mustSearchInternal) {
          // ── 강제 검색 경로 (nano 건너뛰기) ─────────────────
          // anaphora·고유명사 감지 시 nano 라우팅 생략하고 직접 search_internal_docs 호출.
          controller.enqueue(send({ type: 'plan', content: '📂 사내 자료를 검색합니다...' }))

          const enrichedQuery = enrichQueryFromHistory(message, historyMessages)
          const mode = detectListingMode(message)

          const forcedCalls: ChatCompletionMessageToolCall[] = [
            {
              id: `forced_internal_${Date.now()}`,
              type: 'function',
              function: {
                name: 'search_internal_docs',
                arguments: JSON.stringify({ query: enrichedQuery, mode }),
              },
            },
          ]
          if (mustSearchWeb) {
            forcedCalls.push({
              id: `forced_web_${Date.now()}`,
              type: 'function',
              function: {
                name: 'web_search',
                arguments: JSON.stringify({ query: enrichedQuery }),
              },
            })
          }

          const [forcedResult, forcedMemories] = await Promise.all([
            executeToolCalls(forcedCalls),
            userId ? getRelevantMemories(userId, message, 3) : Promise.resolve([]),
          ])

          toolCallMessage = { role: 'assistant', content: null, tool_calls: forcedCalls }
          toolMessages = forcedResult.messages
          ragSources = forcedResult.ragSources

          if (forcedMemories.length > 0) {
            const memoryBlock = `# 장기 기억 (이전 대화에서 학습한 정보)\n${forcedMemories.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\n---\n\n`
            userContent = memoryBlock + message
          }

          if (forcedResult.searchSummary) {
            controller.enqueue(send({ type: 'search_done', content: forcedResult.searchSummary }))
          }
          // nano 호출 0회 → toolInputTokens / toolOutputTokens 0 유지

        } else {
          // ── nano 라우터 경로 ────────────────────────────────
          controller.enqueue(send({ type: 'plan', content: '🔎 분석 중...' }))

          try {
            const [toolDecision, memories] = await Promise.all([
              client.chat.completions.create({
                model: TOOL_DECISION_MODEL,
                messages: [
                  { role: 'system', content: ROUTER_PROMPT },
                  ...historyMessages,
                  { role: 'user', content: message },
                ],
                tools: TOOLS,
                tool_choice: 'auto',
                max_completion_tokens: 150,
              }),
              userId ? getRelevantMemories(userId, message, 3) : Promise.resolve([]),
            ])

            // 메모리 블록 구성 → userContent 업데이트
            if (memories.length > 0) {
              const memoryBlock = `# 장기 기억 (이전 대화에서 학습한 정보)\n${memories.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\n---\n\n`
              userContent = memoryBlock + message
            }

            toolInputTokens = toolDecision.usage?.prompt_tokens ?? 0
            toolOutputTokens = toolDecision.usage?.completion_tokens ?? 0
            toolCallMessage = toolDecision.choices[0].message as ToolCallMessage

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

        // ── 최종 응답 메시지 구성 ─────────────────────────
        // grounding 메시지: 검색 결과가 있을 때만 citation 강제. BASE_SYSTEM_PROMPT 캐시 유지.
        const groundingMessage: import('openai/resources').ChatCompletionMessageParam | null =
          ragSources.length > 0
            ? {
                role: 'system',
                content: `# 이번 답변 grounding 규칙 (필수)
이번 응답에 사내 자료 ${ragSources.length}건이 검색되었다. 아래 규칙을 엄수하라.

1. 사내 자료를 인용한 모든 주장 뒤에 반드시 [출처: 문서명] 인라인 표기.
2. 사내 자료에 없는 사실은 (추정) 표기 또는 답변에서 제외.
3. 검색된 사내 자료가 질문과 무관할 경우에만 "사내 자료에서 직접 매칭 없음. 유사 사례 기반 추론." 1줄 표기 후 일반 지식 답변 허용.
4. 사내 자료를 단 하나도 인용하지 않은 채 일반론만으로 답변하는 것 금지. 검색된 자료를 반드시 1회 이상 인용하라.`,
              }
            : null

        const finalMessages: import('openai/resources').ChatCompletionMessageParam[] = [
          { role: 'system', content: BASE_SYSTEM_PROMPT },
          ...(groundingMessage ? [groundingMessage] : []),
          ...historyMessages,
          { role: 'user', content: userContent },
          ...(toolCallMessage?.tool_calls?.length
            ? [
                toolCallMessage as import('openai/resources').ChatCompletionMessageParam,
                ...toolMessages as import('openai/resources').ChatCompletionMessageParam[],
              ]
            : []),
        ]

        // ── 출력 토큰 한도 결정 ───────────────────────────
        // nano 모델의 [SHORT/MEDIUM/LONG] 태그 → max_completion_tokens 결정.
        // max_completion_tokens는 상한일 뿐 — 짧은 답변이면 자연히 일찍 끝남.
        const hasToolCalls = !!(toolCallMessage?.tool_calls?.length)
        const maxTokens = resolveMaxTokens(hasToolCalls, message)

        // ── 스트리밍 응답 ─────────────────────────────────
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

        // ── 사용량 로그 (도구 선택 + 응답 토큰 합산) ─────
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
