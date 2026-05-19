import { NextRequest, NextResponse } from 'next/server'

const META_API_BASE = 'https://graph.facebook.com/v20.0'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const accessToken = process.env.META_ACCESS_TOKEN
  if (!accessToken) {
    return NextResponse.json(
      { error: 'META_ACCESS_TOKEN이 설정되지 않았습니다.' },
      { status: 503 }
    )
  }

  try {
    const res = await fetch(
      `${META_API_BASE}/me/adaccounts?fields=id,name,account_status,currency&access_token=${accessToken}`
    )
    const data = await res.json()

    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 400 })
    }

    return NextResponse.json(data.data ?? [])
  } catch (err) {
    console.error('Meta accounts API 오류:', err)
    return NextResponse.json({ error: '광고 계정을 불러올 수 없습니다.' }, { status: 500 })
  }
}
