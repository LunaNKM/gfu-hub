import { NextRequest, NextResponse } from 'next/server'
import { getBrandImpacts, getTrendSignals, getWeeklyMarketReports, saveWeeklyMarketReport } from '@/lib/services/intelligenceSignals'
import { isAuthResponse, requireAuth } from '@/lib/server/auth'

function weekRange() {
  const now = new Date()
  const day = now.getDay()
  const start = new Date(now)
  start.setDate(now.getDate() - ((day + 6) % 7))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return {
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: end.toISOString().slice(0, 10),
  }
}

export async function GET(req: NextRequest) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  try {
    const reports = await getWeeklyMarketReports()
    return NextResponse.json({ reports })
  } catch (err) {
    console.error('주간 리포트 조회 오류:', err)
    return NextResponse.json({ error: '주간 리포트를 불러올 수 없습니다.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  try {
    const [signals, impacts] = await Promise.all([getTrendSignals(20), getBrandImpacts()])
    const range = weekRange()
    const id = await saveWeeklyMarketReport({
      ...range,
      summary:
        signals.length > 0
          ? `이번 주 저장된 일본 시장 트렌드 ${signals.length}건을 기준으로 주요 기회와 리스크를 정리했습니다.`
          : '이번 주 저장된 트렌드가 아직 없습니다.',
      keyTrends: signals.slice(0, 5).map((s) => s.title),
      brandImpacts: impacts.slice(0, 8),
      competitorMoves: signals
        .filter((s) => s.relatedCompetitors.length > 0)
        .slice(0, 5)
        .map((s) => `${s.relatedCompetitors.join(', ')}: ${s.title}`),
      recommendedActions: [
        '영향도 높은 트렌드를 진행 중 캠페인의 콘텐츠 가이드에 반영',
        '경쟁사 언급이 있는 트렌드는 후보 발굴 키워드에 추가',
        '주간 리포트 내용을 캠페인 제안서/리포트 인사이트에 재사용',
      ],
    })
    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    console.error('주간 리포트 생성 오류:', err)
    return NextResponse.json({ error: '주간 리포트를 생성할 수 없습니다.' }, { status: 500 })
  }
}

