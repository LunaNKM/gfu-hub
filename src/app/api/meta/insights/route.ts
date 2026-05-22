import { NextRequest, NextResponse } from 'next/server'

const META_API_BASE = 'https://graph.facebook.com/v20.0'

async function safeFetch(url: string) {
  try {
    const res = await fetch(url)
    const data = await res.json()
    if (data.error) return []
    return data.data ?? []
  } catch {
    return []
  }
}

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

  const base = `${META_API_BASE}/${accountId}/insights`
  const tk = `access_token=${accessToken}`
  const dp = `date_preset=${datePreset}`

  try {
    const campaignFields = [
      'campaign_name', 'campaign_id', 'impressions', 'clicks', 'spend',
      'ctr', 'cpc', 'reach', 'frequency',
      'quality_ranking', 'engagement_rate_ranking', 'conversion_rate_ranking',
    ].join(',')

    const trendFields = 'spend,impressions,clicks,frequency,ctr'

    const videoFields = [
      'campaign_name', 'campaign_id', 'impressions',
      'video_play_actions',                     // 재생 수
      'video_continuous_2_sec_watched_actions', // 2초+ 시청 (구 3s 대체)
      'video_thruplay_watched_actions',         // 완주 시청 (15s 또는 전체)
      'video_avg_time_watch_actions',           // 평균 시청 시간(ms)
      'video_p25_watched_actions',
      'video_p50_watched_actions',
      'video_p75_watched_actions',
      'video_p100_watched_actions',
    ].join(',')

    const [campaignRes, trendRes, ageGender, placement, video, hourly] = await Promise.all([
      fetch(`${base}?fields=${campaignFields}&${dp}&level=campaign&limit=50&${tk}`).then(r => r.json()),
      fetch(`${base}?fields=${trendFields}&${dp}&time_increment=1&limit=100&${tk}`).then(r => r.json()),
      safeFetch(`${base}?fields=impressions,clicks,spend,ctr,cpc&breakdowns=age,gender&${dp}&level=account&${tk}`),
      safeFetch(`${base}?fields=impressions,clicks,spend,ctr,cpc,cpm&breakdowns=publisher_platform,platform_position&${dp}&level=account&${tk}`),
      safeFetch(`${base}?fields=${videoFields}&${dp}&level=campaign&limit=50&${tk}`),
      safeFetch(`${base}?fields=impressions,clicks,ctr,spend&breakdowns=hourly_stats_aggregated_by_advertiser_time_zone&${dp}&level=account&${tk}`),
    ])

    if (campaignRes.error) {
      return NextResponse.json({ error: campaignRes.error.message }, { status: 400 })
    }

    return NextResponse.json({
      campaigns: campaignRes.data ?? [],
      trend: trendRes.data ?? [],
      ageGender,
      placement,
      video,
      hourly,
    })
  } catch (err) {
    console.error('Meta insights API 오류:', err)
    return NextResponse.json({ error: '인사이트 데이터를 불러올 수 없습니다.' }, { status: 500 })
  }
}
