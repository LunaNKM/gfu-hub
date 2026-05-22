import { NextRequest, NextResponse } from 'next/server'
import { isAuthResponse, requireAuth } from '@/lib/server/auth'
import { deleteDocument, patchDocument } from '@/lib/server/firestoreRest'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const user = requireAuth(req)
  if (isAuthResponse(user)) return user
  const { taskId } = await params

  try {
    const body = await req.json()
    await patchDocument(user.token, 'campaignTasks', taskId, {
      ...body,
      updatedAt: new Date(),
    })
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
    await deleteDocument(user.token, 'campaignTasks', taskId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('캠페인 태스크 삭제 오류:', err)
    return NextResponse.json({ error: '태스크를 삭제할 수 없습니다.' }, { status: 500 })
  }
}
