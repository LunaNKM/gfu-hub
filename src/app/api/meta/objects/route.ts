import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthResponse } from '@/lib/server/auth'
import type {
  MetaCampaignObject,
  MetaAdsetObject,
  MetaAdObject,
  MetaObjectsResponse,
} from '@/types/campaignMeta'

const META_API_BASE = 'https://graph.facebook.com/v20.0'
const MAX_PAGES = 20

// Follows paging.next until exhausted or MAX_PAGES reached
async function fetchAllPages(
  initialUrl: string
): Promise<Record<string, unknown>[]> {
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

    if (!res.ok) {
      throw new Error(`Meta API HTTP 오류: ${res.status}`)
    }

    let data: Record<string, unknown>
    try {
      data = (await res.json()) as Record<string, unknown>
    } catch {
      throw new Error('Meta API 응답을 파싱할 수 없습니다.')
    }

    if (data['error']) {
      const metaErr = data['error'] as Record<string, unknown>
      throw new Error(
        `Meta API 오류: ${metaErr['message'] ?? '알 수 없는 오류'}`
      )
    }

    const rows = (data['data'] as Record<string, unknown>[] | undefined) ?? []
    all.push(...rows)

    const paging = data['paging'] as Record<string, unknown> | undefined
    const next = paging?.['next'] as string | undefined
    nextUrl = next ?? null

    if (rows.length === 0) break
  }

  return all
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (isAuthResponse(auth)) return auth

  const { searchParams } = new URL(req.url)
  let accountId = (searchParams.get('accountId') ?? '').trim()

  if (!accountId) {
    return NextResponse.json({ error: 'accountId가 필요합니다.' }, { status: 400 })
  }
  if (!accountId.startsWith('act_')) {
    accountId = `act_${accountId}`
  }

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
    const rawCampaigns = await fetchAllPages(
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
    const rawAdsets = await fetchAllPages(
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
      limit: '500',
      access_token: accessToken,
    })
    const rawAds = await fetchAllPages(
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
    }

    return NextResponse.json(response)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Meta objects 조회 실패'
    console.error('Meta objects API 오류:', msg)
    return NextResponse.json(
      { error: 'Meta objects를 불러오지 못했습니다.', detail: msg },
      { status: 502 }
    )
  }
}
