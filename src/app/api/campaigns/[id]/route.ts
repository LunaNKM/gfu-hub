import { NextRequest, NextResponse } from 'next/server'
import { getCampaign, updateCampaign, deleteCampaign } from '@/lib/services/campaigns'

function auth(req: NextRequest) {
  const h = req.headers.get('Authorization')
  return h?.startsWith('Bearer ') ? h.slice(7) : null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!auth(req)) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const { id } = await params
  try {
    const campaign = await getCampaign(id)
    if (!campaign) return NextResponse.json({ error: '캠페인을 찾을 수 없습니다.' }, { status: 404 })
    return NextResponse.json({ campaign })
  } catch (err) {
    console.error('캠페인 조회 오류:', err)
    return NextResponse.json({ error: '캠페인을 불러올 수 없습니다.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!auth(req)) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const { id } = await params
  try {
    const body = await req.json()
    await updateCampaign(id, body)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('캠페인 수정 오류:', err)
    return NextResponse.json({ error: '캠페인을 수정할 수 없습니다.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!auth(req)) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const { id } = await params
  try {
    await deleteCampaign(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('캠페인 삭제 오류:', err)
    return NextResponse.json({ error: '캠페인을 삭제할 수 없습니다.' }, { status: 500 })
  }
}
