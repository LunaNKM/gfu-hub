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

  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('accountId')
  const datePreset = searchParams.get('datePreset') ?? 'last_30d'

  if (!accountId) {
    return NextResponse.json({ error: 'accountId가 필요합니다.' }, { status: 400 })
  }

  try {
    const campaignFields = 'campaign_name,campaign_id,impressions,clicks,spend,ctr,cpc,reach,frequency'
    const trendFields = 'spend,impressions,clicks'

    const [campaignRes, trendRes] = await Promise.all([
      fetch(
        `${META_API_BASE}/${accountId}/insights?fields=${campaignFields}&date_preset=${datePreset}&level=campaign&limit=50&access_token=${accessToken}`
      ),
      fetch(
        `${META_API_BASE}/${accountId}/insights?fields=${trendFields}&date_preset=${datePreset}&time_increment=1&limit=100&access_token=${accessToken}`
      ),
    ])

    const [campaignData, trendData] = await Promise.all([
      campaignRes.json(),
      trendRes.json(),
    ])

    if (campaignData.error) {
      return NextResponse.json({ error: campaignData.error.message }, { status: 400 })
    }

    return NextResponse.json({
      campaigns: campaignData.data ?? [],
      trend: trendData.data ?? [],
    })
  } catch (err) {
    console.error('Meta insights API 오류:', err)
    return NextResponse.json({ error: '인사이트 데이터를 불러올 수 없습니다.' }, { status: 500 })
  }
}
