import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import { normalizeMetaAdAccountId } from '@/lib/campaigns/metaAccount'
import type {
  MetaCampaignObject,
  MetaAdsetObject,
  MetaAdObject,
  MetaObjectsResponse,
} from '@/types/campaignMeta'

const META_API_BASE = 'https://graph.facebook.com/v20.0'
// MAX_PAGES = 5 caps at 5 × limit items per entity type (campaigns 5×100=500,
// adsets 5×200=1000, ads 5×200=1000). Accounts with more objects will see
// truncated=true in the response — reduce scope rather than paginate further.
const MAX_PAGES = 5

class MetaObjectsRateLimitError extends Error {
  readonly isRateLimit = true
  constructor(message: string) {
    super(message)
    this.name = 'MetaObjectsRateLimitError'
  }
}

// Follows paging.next until exhausted or MAX_PAGES reached.
// Parses the JSON body first so Meta's error message is always surfaced,
// even on 4xx responses (Meta always returns JSON with an 'error' field).
// Returns rows and a truncated flag (true if MAX_PAGES was hit with more pages remaining).
async function fetchAllPages(
  initialUrl: string
): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> {
  const all: Record<string, unknown>[] = []
  let nextUrl: string | null = initialUrl

  for (let page = 0; page < MAX_PAGES; page++) {
    if (!nextUrl) break

    let res: Response
    try {
      res = await fetch(nextUrl)
    } catch (err) {
      throw new Error(
        `Meta API 네트워크 오류: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    // Always parse the body first — Meta returns JSON even on 4xx/5xx
    let data: Record<string, unknown>
    try {
      data = (await res.json()) as Record<string, unknown>
    } catch {
      throw new Error(`Meta API 응답을 파싱할 수 없습니다. (HTTP ${res.status})`)
    }

    // Surface the actual Meta error message (present on both ok and error responses)
    if (data['error']) {
      const metaErr = data['error'] as Record<string, unknown>
      const msg = (metaErr['message'] as string | undefined) ?? '알 수 없는 오류'
      const code = metaErr['code'] as number | undefined
      const subcode = metaErr['error_subcode'] as number | undefined
      const detail = subcode ? `[${code}/${subcode}]` : code ? `[${code}]` : ''
      if (code === 17 || subcode === 2446079) {
        throw new MetaObjectsRateLimitError(`Meta API 오류 ${detail}: ${msg}`)
      }
      throw new Error(`Meta API 오류 ${detail}: ${msg}`)
    }

    if (!res.ok) {
      throw new Error(`Meta API HTTP 오류: ${res.status}`)
    }

    const rows = (data['data'] as Record<string, unknown>[] | undefined) ?? []
    all.push(...rows)

    const paging = data['paging'] as Record<string, unknown> | undefined
    const next = paging?.['next'] as string | undefined
    nextUrl = next ?? null

    if (rows.length === 0) break

    // If we've hit MAX_PAGES and there's still a next page, mark as truncated
    if (page === MAX_PAGES - 1 && nextUrl) {
      return { rows: all, truncated: true }
    }
  }

  return { rows: all, truncated: false }
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { searchParams } = new URL(req.url)
  const rawAccountId = (searchParams.get('accountId') ?? '').trim()

  if (!rawAccountId) {
    return NextResponse.json({ error: 'accountId가 필요합니다.' }, { status: 400 })
  }
  const accountId = normalizeMetaAdAccountId(rawAccountId)

  const accessToken = process.env.META_ACCESS_TOKEN
  if (!accessToken) {
    return NextResponse.json(
      { error: 'META_ACCESS_TOKEN이 설정되지 않았습니다.' },
      { status: 503 }
    )
  }

  try {
    // ── Campaigns ──────────────────────────────────────────────────
    const campaignParams = new URLSearchParams({
      fields: 'id,name,status,effective_status,objective,created_time,updated_time',
      limit: '100',
      access_token: accessToken,
    })
    const { rows: rawCampaigns, truncated: campaignsTruncated } = await fetchAllPages(
      `${META_API_BASE}/${accountId}/campaigns?${campaignParams.toString()}`
    )
    const campaigns: MetaCampaignObject[] = rawCampaigns
      .map((c) => ({
        id: String(c['id'] ?? ''),
        name: String(c['name'] ?? ''),
        status: c['status'] as string | undefined,
        effectiveStatus: c['effective_status'] as string | undefined,
        objective: c['objective'] as string | undefined,
        createdTime: c['created_time'] as string | undefined,
        updatedTime: c['updated_time'] as string | undefined,
      }))
      .filter((c) => c.id.length > 0)

    // ── Ad Sets ────────────────────────────────────────────────────
    const adsetParams = new URLSearchParams({
      fields: 'id,name,status,effective_status,campaign_id,created_time,updated_time',
      limit: '200',
      access_token: accessToken,
    })
    const { rows: rawAdsets, truncated: adsetsTruncated } = await fetchAllPages(
      `${META_API_BASE}/${accountId}/adsets?${adsetParams.toString()}`
    )
    const adsets: MetaAdsetObject[] = rawAdsets
      .map((a) => ({
        id: String(a['id'] ?? ''),
        name: String(a['name'] ?? ''),
        campaignId: String(a['campaign_id'] ?? ''),
        status: a['status'] as string | undefined,
        effectiveStatus: a['effective_status'] as string | undefined,
        createdTime: a['created_time'] as string | undefined,
        updatedTime: a['updated_time'] as string | undefined,
      }))
      .filter((a) => a.id.length > 0)

    // ── Ads ────────────────────────────────────────────────────────
    const adParams = new URLSearchParams({
      fields: 'id,name,status,effective_status,campaign_id,adset_id,created_time,updated_time',
      limit: '200',
      access_token: accessToken,
    })
    const { rows: rawAds, truncated: adsTruncated } = await fetchAllPages(
      `${META_API_BASE}/${accountId}/ads?${adParams.toString()}`
    )
    const ads: MetaAdObject[] = rawAds
      .map((a) => ({
        id: String(a['id'] ?? ''),
        name: String(a['name'] ?? ''),
        campaignId: a['campaign_id'] as string | undefined,
        adsetId: String(a['adset_id'] ?? ''),
        status: a['status'] as string | undefined,
        effectiveStatus: a['effective_status'] as string | undefined,
        createdTime: a['created_time'] as string | undefined,
        updatedTime: a['updated_time'] as string | undefined,
      }))
      .filter((a) => a.id.length > 0)

    const response: MetaObjectsResponse = {
      campaigns,
      adsets,
      ads,
      fetchedAt: new Date().toISOString(),
      truncated: campaignsTruncated || adsetsTruncated || adsTruncated || undefined,
    }

    return NextResponse.json(response)
  } catch (err) {
    if (err instanceof MetaObjectsRateLimitError) {
      return NextResponse.json(
        {
          error: 'META_RATE_LIMIT',
          message: 'Meta API request limit reached. Please retry later.',
          retryAfterSeconds: 60,
        },
        { status: 429 }
      )
    }
    const msg = err instanceof Error ? err.message : 'Meta objects 조회 실패'
    console.error('Meta objects API 오류:', msg)
    return NextResponse.json(
      { error: 'Meta objects를 불러오지 못했습니다.', detail: msg },
      { status: 502 }
    )
  }
}
