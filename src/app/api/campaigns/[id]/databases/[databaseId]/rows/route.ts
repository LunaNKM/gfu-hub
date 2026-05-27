import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import {
  queryCollectionOrdered,
  createDocument,
} from '@/lib/server/firestoreRest'
import { getCampaignOwnedResource } from '@/lib/server/campaignResourceAuth'
import { CampaignDatabase, CampaignDataColumn } from '@/types'
import { CampaignDatabaseRow } from '@/types/campaignDatabase'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; databaseId: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id, databaseId } = await params

  try {
    const database = await getCampaignOwnedResource<CampaignDatabase>(
      auth.token,
      'campaignDatabases',
      databaseId,
      id
    )
    if (database instanceof NextResponse) return database

    const rows = await queryCollectionOrdered<CampaignDatabaseRow>(
      auth.token,
      'campaignDatabaseRows',
      'databaseId',
      databaseId,
      'order'
    )

    return NextResponse.json({ rows })
  } catch (err) {
    console.error('rows 조회 오류:', err)
    return NextResponse.json({ error: '행을 불러올 수 없습니다.' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; databaseId: string }> }
) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { id, databaseId } = await params

  try {
    const database = await getCampaignOwnedResource<CampaignDatabase>(
      auth.token,
      'campaignDatabases',
      databaseId,
      id
    )
    if (database instanceof NextResponse) return database

    const body = await req.json()
    const now = new Date().toISOString()

    // 빈 셀 초기화
    const cells: Record<string, unknown> = {}
    const columns: CampaignDataColumn[] = database.columns ?? []
    for (const col of columns) {
      cells[col.id] = body.cells?.[col.id] ?? null
    }

    const maxOrder = typeof body.order === 'number' ? body.order : Date.now()

    const rowData: Record<string, unknown> = {
      campaignId: id,
      databaseId,
      cells,
      order: maxOrder,
      createdAt: now,
      updatedAt: now,
    }

    const rowId = body.id ?? `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    await createDocument(auth.token, 'campaignDatabaseRows', rowData, rowId)

    return NextResponse.json({
      row: { id: rowId, ...rowData } as CampaignDatabaseRow,
    })
  } catch (err) {
    console.error('row 생성 오류:', err)
    return NextResponse.json({ error: '행을 생성할 수 없습니다.' }, { status: 500 })
  }
}
