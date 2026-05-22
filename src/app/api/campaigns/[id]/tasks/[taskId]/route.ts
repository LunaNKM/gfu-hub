import { NextRequest, NextResponse } from 'next/server'
import { deleteCampaignTask, updateCampaignTask } from '@/lib/services/campaignWorkflow'
import { isAuthResponse, requireAuth } from '@/lib/server/auth'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  const { taskId } = await params

  try {
    const body = await req.json()
    await updateCampaignTask(taskId, body)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('캠페인 태스크 수정 오류:', err)
    return NextResponse.json({ error: '태스크를 수정할 수 없습니다.' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  const { taskId } = await params

  try {
    await deleteCampaignTask(taskId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('캠페인 태스크 삭제 오류:', err)
    return NextResponse.json({ error: '태스크를 삭제할 수 없습니다.' }, { status: 500 })
  }
}

