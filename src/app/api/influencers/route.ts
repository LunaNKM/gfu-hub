import { NextRequest, NextResponse } from 'next/server'
import { getInfluencers, searchInfluencers } from '@/lib/services/influencers'

function auth(req: NextRequest) {
  const h = req.headers.get('Authorization')
  return h?.startsWith('Bearer ') ? h.slice(7) : null
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const platform = searchParams.get('platform') || ''
  const minFollowers = parseInt(searchParams.get('minFollowers') || '0', 10)

  const influencers =
    platform || minFollowers > 0
      ? await searchInfluencers(platform || undefined, minFollowers)
      : await getInfluencers()

  return NextResponse.json({ influencers })
}
