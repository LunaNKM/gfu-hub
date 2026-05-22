import { NextRequest, NextResponse } from 'next/server'
import { CampaignStage, CampaignTaskStatus } from '@/types'
import { isAuthResponse, requireAuth } from '@/lib/server/auth'
import { createDocument, queryCollectionByField } from '@/lib/server/firestoreRest'

const DEFAULT_TASKS: { stage: CampaignStage; title: string }[] = [
  { stage: 'discovery', title: '후보 인플루언서 풀 구성' },
  { stage: 'contacting', title: '컨택 가능 여부 확인' },
  { stage: 'contracting', title: '조건/단가 확정 및 계약' },
  { stage: 'draft_review', title: '콘텐츠 초안 수집' },
  { stage: 'approval', title: '브랜드 승인 및 수정 반영' },
  { stage: 'publishing', title: '게시 일정 확인' },
  { stage: 'performance', title: '성과 데이터 수집' },
  { stage: 'reporting', title: '리포트 인사이트 작성' },
]

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  const { id } = await params
  const { searchParams } = new URL(req.url)

  try {
    let tasks = await queryCollectionByField<Record<string, unknown>>(user.token, 'campaignTasks', 'campaignId', id)
    if (searchParams.get('ensure') === '1' && tasks.length === 0) {
      await Promise.all(DEFAULT_TASKS.map((task) =>
        createDocument(user.token, 'campaignTasks', {
          campaignId: id,
          stage: task.stage,
          title: task.title,
          status: 'todo',
          createdBy: user.uid,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      ))
      tasks = await queryCollectionByField<Record<string, unknown>>(user.token, 'campaignTasks', 'campaignId', id)
    }
    tasks.sort((a, b) => String(a.stage).localeCompare(String(b.stage)))
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

    const taskId = await createDocument(user.token, 'campaignTasks', {
      campaignId: id,
      stage: (body.stage as CampaignStage) ?? 'discovery',
      title,
      description: body.description ?? '',
      assigneeId: body.assigneeId ?? '',
      dueDate: body.dueDate ?? '',
      status: (body.status as CampaignTaskStatus) ?? 'todo',
      relatedInfluencerId: body.relatedInfluencerId ?? '',
      createdBy: user.uid,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    return NextResponse.json({ id: taskId }, { status: 201 })
  } catch (err) {
    console.error('캠페인 태스크 생성 오류:', err)
    return NextResponse.json({ error: '태스크를 생성할 수 없습니다.' }, { status: 500 })
  }
}
