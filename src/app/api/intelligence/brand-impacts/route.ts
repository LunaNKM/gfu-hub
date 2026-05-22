import { NextRequest, NextResponse } from 'next/server'
import { isAuthResponse, requireAuth } from '@/lib/server/auth'
import { createDocument, listCollection, queryCollectionByField } from '@/lib/server/firestoreRest'
import { BrandImpact } from '@/types'

export async function GET(req: NextRequest) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  const { searchParams } = new URL(req.url)
  try {
    const brandName = searchParams.get('brandName')
    const impacts = brandName
      ? await queryCollectionByField<BrandImpact>(user.token, 'brandImpacts', 'brandName', brandName)
      : await listCollection<BrandImpact>(user.token, 'brandImpacts')
    impacts.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
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
    const id = await createDocument(user.token, 'brandImpacts', {
      trendSignalId: String(body.trendSignalId ?? ''),
      brandName: String(body.brandName ?? ''),
      relevanceScore: Number(body.relevanceScore ?? 60),
      opportunity: String(body.opportunity ?? ''),
      risk: String(body.risk ?? ''),
      suggestedAction: String(body.suggestedAction ?? ''),
      createdAt: new Date(),
    })
    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    console.error('브랜드 영향도 저장 오류:', err)
    return NextResponse.json({ error: '브랜드 영향도를 저장할 수 없습니다.' }, { status: 500 })
  }
}
