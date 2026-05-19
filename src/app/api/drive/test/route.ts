import { NextRequest, NextResponse } from 'next/server'
import { getDriveClient, listDriveFiles } from '@/lib/services/drive'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

  // 환경변수 체크
  const envStatus = {
    GOOGLE_OAUTH_CLIENT_ID: !!clientId,
    GOOGLE_OAUTH_CLIENT_SECRET: !!clientSecret,
    GOOGLE_OAUTH_REFRESH_TOKEN: !!refreshToken,
    GOOGLE_DRIVE_FOLDER_ID: !!folderId,
  }

  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    return NextResponse.json({ ok: false, envStatus, error: '환경변수 미설정' })
  }

  // Drive 클라이언트 생성 테스트
  const drive = getDriveClient()
  if (!drive) {
    return NextResponse.json({ ok: false, envStatus, error: 'Drive 클라이언트 생성 실패' })
  }

  // 폴더 접근 테스트 (파일 1개만)
  try {
    const files = await listDriveFiles(folderId)
    return NextResponse.json({
      ok: true,
      envStatus,
      fileCount: files.length,
      sampleFiles: files.slice(0, 5).map(f => ({ name: f.name, mimeType: f.mimeType })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, envStatus, error: message })
  }
}
