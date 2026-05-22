import { NextRequest, NextResponse } from 'next/server'
import { getInfluencerScores, scoreInfluencersForCampaign } from '@/lib/services/influencerScoring'
import { isAuthResponse, requireAuth } from '@/lib/server/auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  const { id } = await params
  try {
    const scores = await getInfluencerScores(id)
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
    const scores = await scoreInfluencersForCampaign(id)
    return NextResponse.json({ scores })
  } catch (err) {
    console.error('인플루언서 점수 계산 오류:', err)
    return NextResponse.json({ error: '점수를 계산할 수 없습니다.' }, { status: 500 })
  }
}

