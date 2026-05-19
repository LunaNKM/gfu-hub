import { NextRequest, NextResponse } from 'next/server'
import { getOpenAIClient, OPENAI_MODEL } from '@/lib/openai/client'
import { logAiUsage } from '@/lib/services/usage'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const body = await req.json()
    const { prompt } = body

    if (!prompt) {
      return NextResponse.json({ error: '프롬프트가 없습니다.' }, { status: 400 })
    }

    const client = getOpenAIClient()
    if (!client) {
      return NextResponse.json({ error: 'OpenAI API 키가 설정되지 않았습니다.' }, { status: 503 })
    }

    const systemPrompt = `당신은 AI 프롬프트 전문가입니다. 사용자가 입력한 프롬프트를 더 명확하고 효과적으로 개선해주세요.

다음 원칙을 따르세요:
1. 명확한 역할/컨텍스트 설정
2. 구체적인 작업 지시
3. 원하는 출력 형식 명시
4. 필요한 경우 예시 포함
5. 한국어로 작성

원본 프롬프트의 의도를 유지하면서 더 효과적인 프롬프트로 개선하세요.
개선된 프롬프트만 출력하세요.`

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `다음 프롬프트를 개선해주세요:\n\n${prompt}` },
      ],
      max_tokens: 1000,
    })

    const optimizedPrompt = response.choices[0]?.message?.content || prompt
    const usage = response.usage

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
            model: OPENAI_MODEL,
            inputTokens: usage?.prompt_tokens ?? 0,
            outputTokens: usage?.completion_tokens ?? 0,
            totalTokens: usage?.total_tokens ?? 0,
            feature: 'prompt_optimizer',
            success: true,
          })
        }
      }
    } catch {
      // 로그 실패는 무시
    }

    return NextResponse.json({ optimizedPrompt })
  } catch (error) {
    console.error('Prompt optimize API 오류:', error)
    return NextResponse.json({ error: '프롬프트 최적화 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
