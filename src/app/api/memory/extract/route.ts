/**
 * POST /api/memory/extract
 *
 * 대화가 끝난 뒤 프론트엔드에서 백그라운드로 호출.
 * 최근 대화에서 사내에 유용한 핵심 사실을 0~3개 추출해 memories 컬렉션에 저장.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getOpenAIClient, OPENAI_MODEL } from '@/lib/openai/client'
import { saveMemories } from '@/lib/services/memory'
import { logAiUsage } from '@/lib/services/usage'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: true, extracted: 0 })
    }

    const body = await req.json().catch(() => ({}))
    const { conversationId, history } = body as {
      conversationId?: string
      history?: { role: string; content: string }[]
    }

    // 대화가 2턴 미만이면 추출할 내용 없음
    if (!history || history.length < 2) {
      return NextResponse.json({ success: true, extracted: 0 })
    }

    const client = getOpenAIClient()
    if (!client) return NextResponse.json({ success: true, extracted: 0 })

    // JWT에서 userId 추출
    const parts = authHeader.replace('Bearer ', '').split('.')
    if (parts.length !== 3) return NextResponse.json({ success: true, extracted: 0 })
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))
    const userId = payload.user_id || payload.sub || payload.uid
    if (!userId) return NextResponse.json({ success: true, extracted: 0 })

    // 최근 6턴만 사용 (토큰 절약)
    const recent = history.slice(-6)
    const convText = recent
      .map((m) => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content.slice(0, 400)}`)
      .join('\n')

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: `다음 대화에서 미래 대화에 유용한 중요 사실을 최대 3개 추출하세요.
추출 기준: 회사/팀 특유의 정보, 진행 중인 프로젝트, 중요 결정사항, 사용자 선호도.
일반 지식이나 AI의 설명은 제외. 없으면 빈 배열 반환.
TASK 5: importance는 회사 업무에서의 중요도 (1=낮음, 3=보통, 5=핵심).
반드시 JSON 객체로 응답하세요:
{ "facts": [{"content": "사실1", "importance": 4}, {"content": "사실2", "importance": 2}] }`,
        },
        { role: 'user', content: convText },
      ],
      max_completion_tokens: 300,
      response_format: { type: 'json_object' },
    })

    const inputTokens = response.usage?.prompt_tokens ?? 0
    const outputTokens = response.usage?.completion_tokens ?? 0

    // TASK 5: 중요도 포함 파싱
    let facts: { content: string; importance?: number }[] = []
    try {
      const parsed = JSON.parse(response.choices[0].message.content ?? '{}') as {
        facts?: unknown
      }
      const raw = parsed.facts
      if (Array.isArray(raw)) {
        facts = raw
          .filter((f): f is { content: string; importance?: number } =>
            typeof f === 'object' && f !== null && typeof (f as { content?: unknown }).content === 'string'
          )
          .map((f) => ({
            content: f.content,
            importance: typeof f.importance === 'number'
              ? Math.min(5, Math.max(1, Math.round(f.importance)))
              : 3,
          }))
          .slice(0, 3)
      }
    } catch {
      facts = []
    }

    if (facts.length > 0) {
      await saveMemories(userId, facts, conversationId)
    }

    // 사용량 로그
    if (inputTokens > 0) {
      await logAiUsage({
        userId,
        model: OPENAI_MODEL,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        cachedTokens: 0,
        feature: 'memory',
        success: true,
        conversationId,
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, extracted: facts.length })
  } catch (err) {
    console.error('Memory extraction 오류:', err)
    return NextResponse.json({ success: true, extracted: 0 })
  }
}
