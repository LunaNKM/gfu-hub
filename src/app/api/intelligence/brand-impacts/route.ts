import { NextRequest, NextResponse } from 'next/server'
import { getBrandImpacts, saveBrandImpact } from '@/lib/services/intelligenceSignals'
import { isAuthResponse, requireAuth } from '@/lib/server/auth'

export async function GET(req: NextRequest) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  const { searchParams } = new URL(req.url)
  try {
    const impacts = await getBrandImpacts(searchParams.get('brandName') ?? undefined)
    return NextResponse.json({ impacts })
  } catch (err) {
    console.error('브랜드 영향도 조회 오류:', err)
    return NextResponse.json({ error: '브랜드 영향도를 불러올 수 없습니다.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  try {
    const body = await req.json()
    const id = await saveBrandImpact({
      trendSignalId: String(body.trendSignalId ?? ''),
      brandName: String(body.brandName ?? ''),
      relevanceScore: Number(body.relevanceScore ?? 60),
      opportunity: String(body.opportunity ?? ''),
      risk: String(body.risk ?? ''),
      suggestedAction: String(body.suggestedAction ?? ''),
    })
    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    console.error('브랜드 영향도 저장 오류:', err)
    return NextResponse.json({ error: '브랜드 영향도를 저장할 수 없습니다.' }, { status: 500 })
  }
}

