import { NextRequest, NextResponse } from 'next/server'
import { scoreInfluencerForCampaign } from '@/lib/services/influencerScoring'
import { isAuthResponse, requireAuth } from '@/lib/server/auth'
import { patchDocument, queryCollectionByField } from '@/lib/server/firestoreRest'
import { getCampaign } from '@/lib/services/campaigns'
import { getInfluencers } from '@/lib/services/influencers'
import { InfluencerScore } from '@/types'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  const { id } = await params
  try {
    const scores = await queryCollectionByField<InfluencerScore>(user.token, 'influencerScores', 'campaignId', id)
    scores.sort((a, b) => b.totalScore - a.totalScore)
    return NextResponse.json({ scores })
  } catch (err) {
    console.error('인플루언서 점수 조회 오류:', err)
    return NextResponse.json({ error: '점수를 불러올 수 없습니다.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  const { id } = await params
  try {
    const [campaign, influencers] = await Promise.all([getCampaign(id), getInfluencers(500)])
    const scores = influencers
      .map((influencer) => scoreInfluencerForCampaign(influencer, campaign))
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 100)
    await Promise.all(scores.map((score) => {
      const { id: scoreId, ...data } = score
      return patchDocument(user.token, 'influencerScores', scoreId, {
        ...data,
        updatedAt: new Date(),
      })
    }))
    return NextResponse.json({
      scores,
      message: scores.length > 0
        ? `${scores.length}명의 인플루언서 점수를 계산했습니다.`
        : '인플루언서 CRM 데이터가 없습니다. 캠페인 Sheets를 먼저 동기화하면 후보 점수를 계산할 수 있습니다.',
    })
  } catch (err) {
    console.error('인플루언서 점수 계산 오류:', err)
    return NextResponse.json({ error: '점수를 계산할 수 없습니다.' }, { status: 500 })
  }
}
