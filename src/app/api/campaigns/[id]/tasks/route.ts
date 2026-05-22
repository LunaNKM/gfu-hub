import { NextRequest, NextResponse } from 'next/server'
import { createCampaignTask, ensureDefaultWorkflowTasks, getCampaignTasks } from '@/lib/services/campaignWorkflow'
import { CampaignStage, CampaignTaskStatus } from '@/types'
import { isAuthResponse, requireAuth } from '@/lib/server/auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  const { id } = await params
  const { searchParams } = new URL(req.url)

  try {
    const tasks = searchParams.get('ensure') === '1'
      ? await ensureDefaultWorkflowTasks(id, user.uid)
      : await getCampaignTasks(id)
    return NextResponse.json({ tasks })
  } catch (err) {
    console.error('캠페인 태스크 조회 오류:', err)
    return NextResponse.json({ error: '태스크를 불러올 수 없습니다.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  const { id } = await params

  try {
    const body = await req.json()
    const title = String(body.title ?? '').trim()
    if (!title) return NextResponse.json({ error: '태스크 제목이 필요합니다.' }, { status: 400 })

    const taskId = await createCampaignTask({
      campaignId: id,
      stage: (body.stage as CampaignStage) ?? 'discovery',
      title,
      description: body.description ?? '',
      assigneeId: body.assigneeId ?? '',
      dueDate: body.dueDate ?? '',
      status: (body.status as CampaignTaskStatus) ?? 'todo',
      relatedInfluencerId: body.relatedInfluencerId ?? '',
      createdBy: user.uid,
    })
    return NextResponse.json({ id: taskId }, { status: 201 })
  } catch (err) {
    console.error('캠페인 태스크 생성 오류:', err)
    return NextResponse.json({ error: '태스크를 생성할 수 없습니다.' }, { status: 500 })
  }
}

