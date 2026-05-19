import { NextRequest, NextResponse } from 'next/server'
import { listDriveFiles } from '@/lib/services/drive'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_PRIVATE_KEY
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

  if (!email || !key || !folderId) {
    return NextResponse.json({ configured: false, files: [] })
  }

  try {
    const files = await listDriveFiles(folderId)
    return NextResponse.json({ configured: true, files })
  } catch (error) {
    console.error('Drive 파일 목록 오류:', error)
    return NextResponse.json(
      { error: 'Drive 파일 목록을 가져오지 못했습니다.' },
      { status: 500 }
    )
  }
}
