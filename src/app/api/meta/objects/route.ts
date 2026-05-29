import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import { normalizeMetaAdAccountId } from '@/lib/campaigns/metaAccount'
import type {
  MetaAdObject,
  MetaAdsetObject,
  MetaCampaignObject,
  MetaObjectsResponse,
} from '@/types/campaignMeta'

const META_API_BASE = 'https://graph.facebook.com/v20.0'
const MAX_PAGES = 5

class MetaObjectsRateLimitError extends Error {
  readonly isRateLimit = true
  constructor(message: string) {
    super(message)
    this.name = 'MetaObjectsRateLimitError'
  }
}

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

    let data: Record<string, unknown>
    try {
      data = (await res.json()) as Record<string, unknown>
    } catch {
      throw new Error(`Meta API 응답을 파싱할 수 없습니다. (HTTP ${res.status})`)
    }

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
    const campaignParams = new URLSearchParams({
      fields: 'id,name,status,effective_status,objective,created_time,updated_time',
      limit: '100',
      access_token: accessToken,
    })
    const { rows: rawCampaigns, truncated: campaignsTruncated } = await fetchAllPages(
      `${META_API_BASE}/${accountId}/campaigns?${campaignParams.toString()}`
    )
    const campaigns: MetaCampaignObject[] = rawCampaigns
      .map((campaign) => ({
        id: String(campaign['id'] ?? ''),
        name: String(campaign['name'] ?? ''),
        status: campaign['status'] as string | undefined,
        effectiveStatus: campaign['effective_status'] as string | undefined,
        objective: campaign['objective'] as string | undefined,
        createdTime: campaign['created_time'] as string | undefined,
        updatedTime: campaign['updated_time'] as string | undefined,
      }))
      .filter((campaign) => campaign.id.length > 0)

    const adsetParams = new URLSearchParams({
      fields: 'id,name,status,effective_status,campaign_id,created_time,updated_time',
      limit: '200',
      access_token: accessToken,
    })
    const { rows: rawAdsets, truncated: adsetsTruncated } = await fetchAllPages(
      `${META_API_BASE}/${accountId}/adsets?${adsetParams.toString()}`
    )
    const adsets: MetaAdsetObject[] = rawAdsets
      .map((adset) => ({
        id: String(adset['id'] ?? ''),
        name: String(adset['name'] ?? ''),
        campaignId: String(adset['campaign_id'] ?? ''),
        status: adset['status'] as string | undefined,
        effectiveStatus: adset['effective_status'] as string | undefined,
        createdTime: adset['created_time'] as string | undefined,
        updatedTime: adset['updated_time'] as string | undefined,
      }))
      .filter((adset) => adset.id.length > 0)

    const adParams = new URLSearchParams({
      fields: 'id,name,status,effective_status,campaign_id,adset_id,created_time,updated_time',
      limit: '200',
      access_token: accessToken,
    })
    const { rows: rawAds, truncated: adsTruncated } = await fetchAllPages(
      `${META_API_BASE}/${accountId}/ads?${adParams.toString()}`
    )
    const ads: MetaAdObject[] = rawAds
      .map((ad) => ({
        id: String(ad['id'] ?? ''),
        name: String(ad['name'] ?? ''),
        campaignId: ad['campaign_id'] as string | undefined,
        adsetId: String(ad['adset_id'] ?? ''),
        status: ad['status'] as string | undefined,
        effectiveStatus: ad['effective_status'] as string | undefined,
        createdTime: ad['created_time'] as string | undefined,
        updatedTime: ad['updated_time'] as string | undefined,
      }))
      .filter((ad) => ad.id.length > 0)

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
