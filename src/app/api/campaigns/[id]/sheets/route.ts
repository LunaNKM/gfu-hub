import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { updateCampaign, getCampaign } from '@/lib/services/campaigns'
import { upsertInfluencer, normalizeInfluencerId } from '@/lib/services/influencers'
import { SheetTabType, ParsedSheet, SheetRow, SheetIndexItem, InfluencerAppearance } from '@/types'

function auth(req: NextRequest) {
  const h = req.headers.get('Authorization')
  return h?.startsWith('Bearer ') ? h.slice(7) : null
}

// ── 탭 이름 → 유형 분류 ───────────────────────────────────────
function classifyTab(name: string): SheetTabType | 'SKIP' {
  // 개별 구성안 탭 — 가장 먼저 체크
  if (/^(확인\s?완료|완료|초안|영상초안)\s/.test(name)) return 'SKIP'
  // 제외 키워드
  const skip = ['제공 시술', '설치 매장', '추가 youtube', '추가 tiktok', 'raw data',
                '한화재팬', '협력 ad', '광고 집행', '예산안', '집행 내역', '개요',
                'ad report', 'pa report', '가챠 pr 구성안']
  if (skip.some(k => name.toLowerCase().includes(k.toLowerCase()))) return 'SKIP'

  const n = name.toLowerCase()
  if (n.includes('인게이지')) return 'engagement'
  if (n.includes('타임라인') || n.includes('확정 if') || n.includes('확정if') ||
      n.includes('기자단') || n.includes('체험단')) return 'timeline'
  if (n.includes('후보') || n.includes('추천') || n.includes('시딩')) return 'candidates'
  if (n.includes('콘텐츠') || n.includes('컨텐츠') || n.includes('초안 확인')) return 'content'
  if (n.includes('방문 일정') || n.includes('if 예약') || n.includes('if예약') ||
      n.includes('예약')) return 'schedule'
  if (n.includes('배송')) return 'shipping'
  return 'other'
}

// 탭 이름 앞의 "1. ", "Q2 " 같은 접두사 정리
function cleanDisplayName(name: string): string {
  return name.replace(/^\d+\.\s*/, '').trim()
}

// 탭 이름 → Firestore 키
function slugify(name: string): string {
  return name.replace(/[^a-zA-Z0-9가-힣]/g, '_').replace(/_+/g, '_').slice(0, 60)
}

// ── 헤더 행 자동 탐지 ─────────────────────────────────────────
const HEADER_KEYWORDS = ['계정', 'no.', 'no ', '이름', 'url', '팔로워', '아이디', 'fw', '플랫폼', 'kpi', '名前']
function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 14); i++) {
    const text = rows[i].map(v => String(v ?? '').toLowerCase()).join('|')
    const hits = HEADER_KEYWORDS.filter(k => text.includes(k)).length
    if (hits >= 2) return i
  }
  return -1
}

// ── 섹션 행 판별 (지점명 단독 행) ────────────────────────────
function detectSectionRow(row: unknown[], headerCount: number): string | null {
  const filled = row.filter(v => v !== '' && v !== null && v !== undefined)
  // 전체 컬럼 대비 채워진 셀이 매우 적어야 함
  if (filled.length < 1 || filled.length > Math.max(3, Math.floor(headerCount * 0.3))) return null
  const val = String(filled[0] ?? '').trim()
  if (!val || val.startsWith('http') || /^\d+$/.test(val)) return null
  // "Total", "합계" 등 집계 행 제외
  if (/total|합계|소계|업로드/i.test(val)) return null
  if (val.length > 30) return null
  return val
}

// ── 플랫폼 자동 판별 ──────────────────────────────────────────
function detectPlatform(url: string): string {
  if (!url) return ''
  const u = url.toLowerCase()
  if (u.includes('instagram.com') || u.includes('instagr.am')) return 'Instagram'
  if (u.includes('tiktok.com')) return 'TikTok'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube'
  if (u.includes('x.com') || u.includes('twitter.com')) return 'X'
  return ''
}

// ── 숫자 파싱 ─────────────────────────────────────────────────
function parseNum(v: string): number | null {
  if (!v) return null
  const cleaned = v.replace(/[,\s]/g, '').replace(/[^0-9.-]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

// 성과 수치 컬럼 키워드
const NUMERIC_KEYWORDS = [
  'imp', '노출', '좋아요', '댓글', '저장', '공유', '리포스트', '조회수',
  'eng', 'reach', '도달', '팔로워', 'fw', '비용', '금액', '예산',
  '조회', 'views', 'likes', 'comments', 'saves', 'shares', 'followers',
]
function isNumericHeader(header: string): boolean {
  const lower = header.toLowerCase()
  return NUMERIC_KEYWORDS.some(k => lower.includes(k))
}

// ── 탭 파싱 메인 ─────────────────────────────────────────────
function parseSheetTab(
  rows: unknown[][],
  tabName: string,
  type: SheetTabType
): ParsedSheet | null {
  const headerIdx = findHeaderRow(rows)
  if (headerIdx < 0) return null

  const rawHeaders = rows[headerIdx].map(v =>
    String(v ?? '').trim().replace(/\n+/g, ' ')
  )
  if (rawHeaders.filter(h => h).length < 2) return null

  // 첫 번째 컬럼이 헤더 없이 비어있으면 섹션 컬럼 (패턴 A)
  const hasSectionCol = rawHeaders[0] === '' && rawHeaders.length > 2

  let currentSection = ''
  const parsedRows: SheetRow[] = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]

    // 완전히 빈 행 스킵
    const filled = row.filter(v => v !== '' && v !== null && v !== undefined)
    if (filled.length === 0) continue

    // 패턴 B: 섹션 단독 행 감지
    if (!hasSectionCol) {
      const sec = detectSectionRow(row, rawHeaders.length)
      if (sec) { currentSection = sec; continue }
    }

    // 패턴 A: 첫 컬럼이 섹션 컬럼
    if (hasSectionCol && row[0] !== '' && row[0] !== null && row[0] !== undefined) {
      currentSection = String(row[0]).trim()
    }

    // 행 객체 빌드
    const obj: SheetRow = {}
    if (currentSection) obj._section = currentSection

    const startCol = hasSectionCol ? 1 : 0
    for (let c = startCol; c < rawHeaders.length; c++) {
      const key = rawHeaders[c]
      if (!key) continue
      const cellRaw = row[c]
      if (cellRaw === '' || cellRaw === null || cellRaw === undefined) {
        obj[key] = null
        continue
      }
      const cellStr = String(cellRaw).trim()
      if (isNumericHeader(key)) {
        obj[key] = parseNum(cellStr) ?? cellStr
      } else {
        // Boolean 처리 (Google Sheets TRUE/FALSE)
        if (cellStr === 'TRUE' || cellStr === 'true') { obj[key] = true; continue }
        if (cellStr === 'FALSE' || cellStr === 'false') { obj[key] = false; continue }
        obj[key] = cellStr
      }
    }

    // 플랫폼 자동 판별 — URL 컬럼 탐색
    const urlKey = rawHeaders.find(h => h.toLowerCase() === 'url')
    const urlVal = urlKey ? String(obj[urlKey] ?? '') : ''
    if (urlVal) obj._platform = detectPlatform(urlVal)

    // 의미있는 행인지 확인 (계정명 또는 URL 중 하나는 있어야 함)
    const hasIdent = rawHeaders.some(h => {
      const hl = h.toLowerCase()
      return (hl.includes('계정') || hl.includes('이름') || hl === 'url' ||
              hl === 'fw' || hl === 'id' || hl.includes('아이디') || hl === '名前')
        && obj[h] !== null && obj[h] !== ''
    })
    if (!hasIdent) continue

    parsedRows.push(obj)
  }

  if (parsedRows.length === 0) return null

  return {
    name: tabName,
    displayName: cleanDisplayName(tabName),
    type,
    rawHeaders: rawHeaders.filter(h => h),
    rows: parsedRows,
    rowCount: parsedRows.length,
  }
}

// ── 인플루언서 CRM 추출 + 저장 ───────────────────────────────
const ACCOUNT_KEYWORDS = ['계정 아이디', '계정명', '계정', 'ID', '아이디', '이름', '名前', '진행 확정']
const FOLLOWER_KEYWORDS = ['팔로워', 'fw', 'followers', '팔로워 수']
const URL_KEYWORDS = ['url']
const IMP_KEYWORDS      = ['imp', '조회수', 'impressions', 'reach', '도달', 'views']
const LIKES_KEYWORDS    = ['좋아요', 'likes']
const COMMENTS_KEYWORDS = ['댓글', 'comments']
const SAVES_KEYWORDS    = ['저장', 'saves']
const SHARES_KEYWORDS   = ['공유', 'shares', '리포스트', 'repost']
const ER_KEYWORDS       = ['er%', '인게이지먼트율', 'engagement rate', 'er율']

function findHeader(headers: string[], keywords: string[]): string | undefined {
  for (const kw of keywords) {
    const exact = headers.find((h) => h.toLowerCase() === kw.toLowerCase())
    if (exact) return exact
  }
  for (const kw of keywords) {
    const partial = headers.find((h) => h.toLowerCase().includes(kw.toLowerCase()))
    if (partial) return partial
  }
}

// 반환값: 성공한 upsert 수
async function syncInfluencersToCRM(
  campaignId: string,
  campaignName: string,
  clientName: string,
  sheets: Record<string, ParsedSheet>
): Promise<number> {
  const CRM_TABS: SheetTabType[] = ['timeline', 'engagement', 'candidates']
  const syncedAt = new Date().toISOString()

  // ── docId → upsert 인자를 Map으로 수집 (같은 인플루언서 중복 제거) ──
  // 여러 탭에 같은 계정이 있을 경우 팔로워가 가장 높은 데이터를 우선
  const taskMap = new Map<string, {
    data: { handle: string; platform: string; profileUrl: string; followers: number }
    appearance: InfluencerAppearance
  }>()

  for (const sheet of Object.values(sheets)) {
    if (!CRM_TABS.includes(sheet.type)) continue

    const accountCol  = findHeader(sheet.rawHeaders, ACCOUNT_KEYWORDS)
    const urlCol      = findHeader(sheet.rawHeaders, URL_KEYWORDS)
    const followerCol = findHeader(sheet.rawHeaders, FOLLOWER_KEYWORDS)
    const impCol      = findHeader(sheet.rawHeaders, IMP_KEYWORDS)
    const likesCol    = findHeader(sheet.rawHeaders, LIKES_KEYWORDS)
    const commentsCol = findHeader(sheet.rawHeaders, COMMENTS_KEYWORDS)
    const savesCol    = findHeader(sheet.rawHeaders, SAVES_KEYWORDS)
    const sharesCol   = findHeader(sheet.rawHeaders, SHARES_KEYWORDS)
    const erCol       = findHeader(sheet.rawHeaders, ER_KEYWORDS)

    if (!accountCol) continue

    for (const row of sheet.rows as SheetRow[]) {
      const handle = String(row[accountCol] ?? '').trim()
      if (!handle || handle === '?') continue

      const url       = urlCol ? String(row[urlCol] ?? '').trim() : ''
      const platform  = String(row._platform ?? '').trim()
      const followers = followerCol && typeof row[followerCol] === 'number'
        ? (row[followerCol] as number)
        : 0

      // ── 성과 지표 추출 ────────────────────────────────────────
      const getNum = (col: string | undefined): number | undefined => {
        if (!col) return undefined
        const v = row[col]
        return typeof v === 'number' ? v : undefined
      }
      const imp      = getNum(impCol)
      const likes    = getNum(likesCol)
      const comments = getNum(commentsCol)
      const saves    = getNum(savesCol)
      const shares   = getNum(sharesCol)

      const engParts = [likes, comments, saves, shares].filter((v): v is number => v !== undefined)
      const engSum   = engParts.length > 0 ? engParts.reduce((a, b) => a + b, 0) : undefined

      // ER: 시트 컬럼 우선, 없으면 engSum/imp로 계산
      let er = getNum(erCol)
      if (er === undefined && engSum !== undefined && imp !== undefined && imp > 0) {
        er = parseFloat(((engSum / imp) * 100).toFixed(2))
      }

      const appearance: InfluencerAppearance = {
        campaignId,
        campaignName,
        clientName,
        tabType: sheet.type,
        syncedAt,
        ...(imp     !== undefined ? { imp }     : {}),
        ...(engSum  !== undefined ? { engSum }  : {}),
        ...(er      !== undefined ? { er }      : {}),
      }

      const docId = normalizeInfluencerId(url, platform, handle)
      const existing = taskMap.get(docId)
      // 같은 인플루언서가 이미 있으면 팔로워가 더 많은 데이터로 갱신
      if (!existing || followers > existing.data.followers) {
        taskMap.set(docId, {
          data: { handle, platform, profileUrl: url, followers },
          appearance,
        })
      }
    }
  }

  if (taskMap.size === 0) return 0

  // ── 전원 병렬 upsert ─────────────────────────────────────────
  const results = await Promise.allSettled(
    [...taskMap.entries()].map(([docId, { data, appearance }]) =>
      upsertInfluencer(docId, data, appearance)
    )
  )

  const failed = results.filter((r) => r.status === 'rejected')
  if (failed.length > 0) {
    console.error(`CRM 동기화 오류 ${failed.length}건:`,
      (failed[0] as PromiseRejectedResult).reason)
  }

  return results.filter((r) => r.status === 'fulfilled').length
}

// ── 스프레드시트 ID 추출 ──────────────────────────────────────
function extractSheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

// ── 라우트 핸들러 ─────────────────────────────────────────────
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

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    return NextResponse.json({ error: 'Google OAuth 환경변수가 설정되지 않았습니다.' }, { status: 503 })
  }

  try {
    const oAuth2 = new google.auth.OAuth2(clientId, clientSecret)
    oAuth2.setCredentials({ refresh_token: refreshToken })
    const sheetsApi = google.sheets({ version: 'v4', auth: oAuth2 })

    // 전체 탭 목록
    const meta = await sheetsApi.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties(title)',
    })
    const tabNames = meta.data.sheets?.map(s => s.properties?.title ?? '') ?? []

    const sheets: Record<string, ParsedSheet> = {}
    const sheetsIndex: SheetIndexItem[] = []
    let totalParsed = 0

    for (const tabName of tabNames) {
      const type = classifyTab(tabName)
      if (type === 'SKIP') continue

      // 탭 데이터 읽기
      let values: unknown[][] = []
      try {
        const res = await sheetsApi.spreadsheets.values.get({
          spreadsheetId,
          range: tabName,
          valueRenderOption: 'FORMATTED_VALUE',
        })
        values = (res.data.values ?? []) as unknown[][]
      } catch {
        continue // 읽기 실패한 탭은 건너뜀
      }

      if (values.length < 2) continue

      const parsed = parseSheetTab(values, tabName, type)
      if (!parsed) continue

      const key = slugify(tabName)
      sheets[key] = parsed
      sheetsIndex.push({
        key,
        name: tabName,
        displayName: parsed.displayName,
        type,
        rowCount: parsed.rowCount,
      })
      totalParsed++
    }

    if (totalParsed === 0) {
      return NextResponse.json({ error: '파싱 가능한 탭이 없습니다. URL을 확인하거나 탭 이름을 확인하세요.' }, { status: 400 })
    }

    await updateCampaign(id, {
      sheetsUrl,
      sheetsIndex,
      sheets,
      sheetsLastSyncAt: new Date(),
    })

    // ── 인플루언서 CRM 동기화 (await — 응답 전에 완료 보장) ──────
    let crmSynced = 0
    try {
      const campaign = await getCampaign(id)
      if (campaign) {
        crmSynced = await syncInfluencersToCRM(
          id, campaign.campaignName, campaign.clientName, sheets
        )
      }
    } catch (err) {
      console.error('CRM 동기화 오류:', err)
    }

    return NextResponse.json({
      ok: true,
      totalTabs: tabNames.length,
      parsedTabs: totalParsed,
      sheetsIndex,
      crmSynced,
    })
  } catch (err) {
    console.error('Sheets 동기화 오류:', err)
    return NextResponse.json({ error: 'Google Sheets 데이터를 읽을 수 없습니다.' }, { status: 500 })
  }
}
