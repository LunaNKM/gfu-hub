import { NextRequest, NextResponse } from 'next/server'
import { getOpenAIClient, OPENAI_MODEL } from '@/lib/openai/client'
import { searchRelevantDocs } from '@/lib/openai/rag'
import { logAiUsage } from '@/lib/services/usage'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const body = await req.json()
    const { conversationId, message, attachments, ragEnabled = true } = body

    if (!message) {
      return NextResponse.json({ error: '메시지가 없습니다.' }, { status: 400 })
    }

    const client = getOpenAIClient()
    if (!client) {
      return NextResponse.json({ error: 'OpenAI API 키가 설정되지 않았습니다.' }, { status: 503 })
    }

    // RAG 검색
    let systemPrompt =
      '당신은 GFutures 회사의 AI 어시스턴트입니다. 친절하고 전문적으로 답변해주세요. 한국어로 답변하세요.'
    let ragSources: { docId: string; title: string; content: string; score: number }[] = []

    if (ragEnabled) {
      ragSources = await searchRelevantDocs(message, 3)
      if (ragSources.length > 0) {
        const docsContext = ragSources
          .map((d) => `[문서: ${d.title}]\n${d.content}`)
          .join('\n\n---\n\n')
        systemPrompt += `\n\n다음은 관련 사내 문서입니다. 이를 참고하여 답변하세요:\n\n${docsContext}`
      }
    }

    // 첨부 파일 컨텍스트
    let userContent = message
    if (attachments && attachments.length > 0) {
      const attachmentContext = attachments
        .filter((a: { extractedText?: string; fileName: string }) => a.extractedText)
        .map((a: { extractedText?: string; fileName: string }) => `[첨부파일: ${a.fileName}]\n${a.extractedText}`)
        .join('\n\n')
      if (attachmentContext) {
        userContent = `${message}\n\n${attachmentContext}`
      }
    }

    // OpenAI API 호출
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: 2000,
    })

    const reply = response.choices[0]?.message?.content || '응답을 생성하지 못했습니다.'
    const usage = response.usage

    const tokenUsage = {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    }

    // 사용량 로그 (userId는 토큰에서 추출하기 어려우므로 body에서 받거나 스킵)
    try {
      // userId 추출 시도 (간단한 JWT 파싱)
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
            inputTokens: tokenUsage.inputTokens,
            outputTokens: tokenUsage.outputTokens,
            totalTokens: tokenUsage.totalTokens,
            feature: 'chat',
            success: true,
          })
        }
      }
    } catch {
      // 로그 실패는 무시
    }

    return NextResponse.json({
      reply,
      ragSources: ragSources.map((s) => ({ docId: s.docId, title: s.title, score: s.score })),
      tokenUsage,
    })
  } catch (error) {
    console.error('Chat API 오류:', error)
    return NextResponse.json({ error: 'AI 응답 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
