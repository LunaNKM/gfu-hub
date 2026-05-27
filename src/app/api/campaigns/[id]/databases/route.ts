import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import { queryCollectionByField, createDocument } from '@/lib/server/firestoreRest'
import { CampaignDatabase, CampaignBusinessType } from '@/types'
import { createDefaultDatabase } from '@/lib/campaigns/databaseTemplates'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id } = await params

  try {
    const databases = await queryCollectionByField<CampaignDatabase>(
      auth.token,
      'campaignDatabases',
      'campaignId',
      id
    )
    const sorted = [...databases].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    return NextResponse.json({ databases: sorted })
  } catch (err) {
    console.error('databases 조회 오류:', err)
    return NextResponse.json({ error: '데이터베이스를 불러올 수 없습니다.' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id } = await params

  try {
    const body = await req.json()
    const { businessType, title, order } = body as {
      businessType: CampaignBusinessType
      title?: string
      order?: number
    }

    // 현재 databases에서 최대 order 계산
    const existing = await queryCollectionByField<CampaignDatabase>(
      auth.token,
      'campaignDatabases',
      'campaignId',
      id
    )
    const maxOrder = existing.reduce((m, d) => Math.max(m, d.order ?? 0), 0)

    const data = createDefaultDatabase({
      campaignId: id,
      businessType,
      title,
      order: order ?? maxOrder + 1000,
      userId: auth.uid,
    })

    const databaseId = await createDocument(
      auth.token,
      'campaignDatabases',
      data as unknown as Record<string, unknown>
    )
    const database = { id: databaseId, ...data }

    return NextResponse.json({ database }, { status: 201 })
  } catch (err) {
    console.error('database 생성 오류:', err)
    return NextResponse.json({ error: '데이터베이스를 생성할 수 없습니다.' }, { status: 500 })
  }
}
