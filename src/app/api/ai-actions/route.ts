import { NextRequest, NextResponse } from 'next/server'
import { createAiActionRun, getAiActionRuns, updateAiActionRun } from '@/lib/services/aiActions'
import { getOpenAIClient, OPENAI_MODEL } from '@/lib/openai/client'
import { getCampaign } from '@/lib/services/campaigns'
import { getInfluencerScores, scoreInfluencersForCampaign } from '@/lib/services/influencerScoring'
import { AiActionType } from '@/types'
import { isAuthResponse, requireAuth } from '@/lib/server/auth'

function actionPrompt(type: AiActionType, input: Record<string, unknown>) {
  const base = `당신은 한국 브랜드의 일본 인플루언서 마케팅을 운영하는 시니어 PM입니다.
모든 출력은 한국어 JSON 객체로만 작성하세요.`

  const common = JSON.stringify(input, null, 2)
  const prompts: Record<AiActionType, string> = {
    recommend_influencers: `${base}
후보 점수 데이터를 바탕으로 추천 우선순위, 추천 이유, 주의 리스크, 다음 액션을 정리하세요.
형식: {"summary":"", "recommendations":[{"handle":"","reason":"","risk":"","nextAction":""}]}
입력:
${common}`,
    draft_proposal: `${base}
캠페인 정보를 바탕으로 클라이언트 제안서 초안을 마크다운 문자열로 작성하세요.
형식: {"title":"", "markdown":""}
입력:
${common}`,
    review_content: `${base}
일본어/한국어 콘텐츠 초안을 검수하세요. #PR/#広告 표시, 과장 표현, 景品表示法 리스크를 확인하고 수정안을 제안하세요.
형식: {"riskLevel":"low|medium|high", "issues":[], "revisedCopy":"", "notes":[]}
입력:
${common}`,
    generate_report_insights: `${base}
성과 데이터를 보고 핵심 성과, 부진 원인, 다음 캠페인 액션을 요약하세요.
형식: {"summary":"", "wins":[], "issues":[], "nextActions":[]}
입력:
${common}`,
    check_japanese_pr_compliance: `${base}
일본 PR 문구의 광고 고지와 景品表示法 리스크를 점검하세요.
형식: {"riskLevel":"low|medium|high", "requiredLabels":[], "riskyExpressions":[], "safeRewrite":"", "explanation":""}
입력:
${common}`,
    summarize_campaign: `${base}
캠페인의 현재 상태와 다음 액션을 운영자 관점에서 요약하세요.
형식: {"summary":"", "stage":"", "blockers":[], "nextActions":[]}
입력:
${common}`,
  }
  return prompts[type]
}

async function runAction(type: AiActionType, input: Record<string, unknown>) {
  const client = getOpenAIClient()
  if (!client) return { error: 'OpenAI API 키가 설정되지 않았습니다.' }

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: 'JSON만 반환하세요. 마크다운 코드펜스는 쓰지 마세요.' },
      { role: 'user', content: actionPrompt(type, input) },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: 1600,
  })

  try {
    return JSON.parse(response.choices[0]?.message?.content ?? '{}') as Record<string, unknown>
  } catch {
    return { content: response.choices[0]?.message?.content ?? '' }
  }
}

export async function GET(req: NextRequest) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaignId')
  if (!campaignId) return NextResponse.json({ error: 'campaignId가 필요합니다.' }, { status: 400 })

  try {
    const runs = await getAiActionRuns(campaignId)
    return NextResponse.json({ runs })
  } catch (err) {
    console.error('AI 액션 기록 조회 오류:', err)
    return NextResponse.json({ error: 'AI 실행 기록을 불러올 수 없습니다.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user

  try {
    const body = await req.json()
    const type = body.type as AiActionType
    const campaignId = body.campaignId as string | undefined
    if (!type) return NextResponse.json({ error: 'type이 필요합니다.' }, { status: 400 })

    const campaign = campaignId ? await getCampaign(campaignId) : null
    let input: Record<string, unknown> = { ...(body.input ?? {}), campaign }

    if (type === 'recommend_influencers' && campaignId) {
      const existing = await getInfluencerScores(campaignId)
      const scores = existing.length > 0 ? existing : await scoreInfluencersForCampaign(campaignId)
      input = { ...input, scores: scores.slice(0, 20) }
    }

    const runId = await createAiActionRun({
      type,
      campaignId,
      influencerId: body.influencerId,
      input,
      output: {},
      status: 'running',
      createdBy: user.uid,
    })

    const output = await runAction(type, input)
    await updateAiActionRun(runId, {
      output,
      status: output.error ? 'failed' : 'completed',
      errorMessage: typeof output.error === 'string' ? output.error : undefined,
    })

    return NextResponse.json({ id: runId, output, status: output.error ? 'failed' : 'completed' })
  } catch (err) {
    console.error('AI 액션 실행 오류:', err)
    return NextResponse.json({ error: 'AI 액션 실행에 실패했습니다.' }, { status: 500 })
  }
}

