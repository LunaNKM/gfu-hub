import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { updateCampaign } from '@/lib/services/campaigns'

function auth(req: NextRequest) {
  const h = req.headers.get('Authorization')
  return h?.startsWith('Bearer ') ? h.slice(7) : null
}

/** Google Sheets URL에서 spreadsheetId 추출 */
function extractSheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

/** 헤더 → 정規화된 필드명 매핑 */
function normalizeHeader(raw: string): string {
  const lower = raw.trim().toLowerCase()
  const map: Record<string, string> = {
    // 이름 / 계정
    '인플루언서': 'name', '인플루언서명': 'name', '이름': 'name', 'name': 'name',
    '계정': 'handle', '계정명': 'handle', '핸들': 'handle', 'handle': 'handle', '@': 'handle',
    // 플랫폼 / 상태
    '플랫폼': 'platform', 'platform': 'platform', 'sns': 'platform',
    '상태': 'status', 'status': 'status', '진행상태': 'status', '진행상황': 'status',
    // 팔로워
    '팔로워': 'followers', '팔로워수': 'followers', 'followers': 'followers',
    // 성과지표
    '조회수': 'views', 'views': 'views', '재생수': 'views',
    '좋아요': 'likes', '좋아요수': 'likes', 'likes': 'likes',
    '댓글': 'comments', '댓글수': 'comments', 'comments': 'comments',
    '공유': 'shares', '공유수': 'shares', 'shares': 'shares',
    '저장': 'saves', '저장수': 'saves', 'saves': 'saves',
    '도달': 'reach', '도달수': 'reach', 'reach': 'reach',
    '노출': 'impressions', '노출수': 'impressions', 'impressions': 'impressions',
    // 계약 / 링크
    '계약금': 'fee', '단가': 'fee', '금액': 'fee', 'fee': 'fee', '비용': 'fee',
    '링크': 'postUrl', '게시글': 'postUrl', 'url': 'postUrl', '게시글링크': 'postUrl',
    // 메모
    '메모': 'memo', 'memo': 'memo', '비고': 'memo', '참고': 'memo',
  }
  return map[lower] ?? raw.trim()
}

/** 숫자 문자열 → number 변환 (콤마, 단위 제거) */
function parseNum(v: string): number | null {
  if (!v) return null
  const cleaned = v.replace(/[,\s만천백]/g, '').replace(/[^0-9.-]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

const NUMERIC_FIELDS = new Set([
  'followers', 'views', 'likes', 'comments', 'shares', 'saves',
  'reach', 'impressions', 'fee',
])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!auth(req)) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const { id } = await params

  const { sheetsUrl } = await req.json()
  if (!sheetsUrl) return NextResponse.json({ error: 'sheetsUrl이 필요합니다.' }, { status: 400 })

  const spreadsheetId = extractSheetId(sheetsUrl)
  if (!spreadsheetId) {
    return NextResponse.json({ error: '올바른 Google Sheets URL이 아닙니다.' }, { status: 400 })
  }

  // OAuth 자격증명 확인
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    return NextResponse.json({ error: 'Google OAuth 환경변수가 설정되지 않았습니다.' }, { status: 503 })
  }

  try {
    const oAuth2 = new google.auth.OAuth2(clientId, clientSecret)
    oAuth2.setCredentials({ refresh_token: refreshToken })
    const sheets = google.sheets({ version: 'v4', auth: oAuth2 })

    // 첫 번째 시트 데이터 읽기
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties(title)',
    })
    const firstSheet = meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1'

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: firstSheet,
      valueRenderOption: 'FORMATTED_VALUE',
    })

    const rows = res.data.values ?? []
    if (rows.length < 2) {
      return NextResponse.json({ error: '시트에 데이터가 없습니다.' }, { status: 400 })
    }

    const rawHeaders = rows[0].map((h: unknown) => String(h ?? ''))
    const normalizedKeys = rawHeaders.map(normalizeHeader)

    const influencers = rows.slice(1).map((row: unknown[]) => {
      const obj: Record<string, string | number | null> = {}
      normalizedKeys.forEach((key, i) => {
        const raw = String(row[i] ?? '').trim()
        if (NUMERIC_FIELDS.has(key)) {
          obj[key] = raw ? parseNum(raw) : null
        } else {
          obj[key] = raw || null
        }
      })
      return obj
    }).filter((row) => Object.values(row).some((v) => v !== null && v !== ''))

    // Firestore에 저장
    await updateCampaign(id, {
      sheetsUrl,
      sheetsHeaders: normalizedKeys,
      influencers,
      sheetsLastSyncAt: new Date(),
    })

    return NextResponse.json({
      ok: true,
      headers: normalizedKeys,
      rawHeaders,
      count: influencers.length,
      influencers,
    })
  } catch (err) {
    console.error('Sheets 동기화 오류:', err)
    return NextResponse.json({ error: 'Google Sheets 데이터를 읽을 수 없습니다.' }, { status: 500 })
  }
}
