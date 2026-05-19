import { NextRequest, NextResponse } from 'next/server'

// 파일 업로드는 클라이언트에서 Firebase Storage에 직접 업로드 후
// 메타데이터만 이 API로 전달하는 방식으로 구현
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const body = await req.json()
    const { fileName, storagePath, downloadURL } = body

    if (!fileName || !storagePath || !downloadURL) {
      return NextResponse.json({ error: '필수 파일 정보가 없습니다.' }, { status: 400 })
    }

    // Firestore에 파일 메타데이터 저장은 클라이언트에서 직접 처리
    // 서버에서는 텍스트 추출만 담당

    return NextResponse.json({
      success: true,
      fileId: storagePath,
      downloadURL,
      message: '파일 정보가 등록되었습니다.',
    })
  } catch (error) {
    console.error('Upload API 오류:', error)
    return NextResponse.json({ error: '파일 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
