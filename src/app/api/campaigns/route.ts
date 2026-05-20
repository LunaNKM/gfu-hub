import { NextRequest, NextResponse } from 'next/server'
import { getCampaigns, createCampaign } from '@/lib/services/campaigns'

function auth(req: NextRequest) {
  const h = req.headers.get('Authorization')
  return h?.startsWith('Bearer ') ? h.slice(7) : null
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  try {
    const campaigns = await getCampaigns()
    return NextResponse.json({ campaigns })
  } catch (err) {
    console.error('캠페인 목록 오류:', err)
    return NextResponse.json({ error: '캠페인 목록을 불러올 수 없습니다.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const token = auth(req)
  if (!token) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  try {
    const body = await req.json()
    const { clientName, campaignName, status, startDate, endDate, budget, memo } = body
    if (!clientName || !campaignName) {
      return NextResponse.json({ error: '클라이언트명과 캠페인명은 필수입니다.' }, { status: 400 })
    }
    const id = await createCampaign({
      clientName,
      campaignName,
      status: status ?? 'proposal',
      startDate: startDate ?? '',
      endDate: endDate ?? '',
      budget: Number(budget ?? 0),
      memo: memo ?? '',
      createdBy: token,
    })
    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    console.error('캠페인 생성 오류:', err)
    return NextResponse.json({ error: '캠페인을 생성할 수 없습니다.' }, { status: 500 })
  }
}
