import * as XLSX from 'xlsx'
import { AdCampaignLine } from '@/types'
import { CAMPAIGN_COLORS, rangeDays, toDateString } from './format'

/**
 * 미디어믹스 xlsx 파서
 *
 * 시트 레이아웃이 브랜드·월마다 다르다. (26.08 큐텐 시트는 캠페인 열이 따로 있고,
 * 26.7 오피노 시트는 Media 열에 캠페인명과 기간이 같이 들어 있다.)
 * 그래서 완전 자동은 포기하고 "헤더 행 추정 → 열 매핑 추정 → 사용자가 고칠 수 있는
 * 미리보기" 순서로 간다. 여기서는 추정과 파싱만 하고, 확정은 화면에서 한다.
 */

export type RawCell = string | number | boolean | Date | null
export type RawRow = RawCell[]

export interface MediaMixSheet {
  name: string
  rows: RawRow[]
}

export interface ColumnMap {
  channel: number
  campaign: number
  media: number
  objective: number
  target: number
  /** 마크업 제외 JP 매체비 */
  budgetJp: number
  /** 마크업 제외 KR 매체비 */
  budgetKr: number
  /** 믹스안이 적어 둔 일예산. 산정일수를 역산하는 데만 쓴다. */
  daily: number
}

export const EMPTY_COLUMN = -1

export interface ParsedLine extends AdCampaignLine {
  /** 믹스안에 적혀 있던 일예산. 역산 근거를 화면에 보여 주려고 들고 있는다. */
  sheetDaily: number | null
}

export interface ParsedCampaign {
  key: string
  name: string
  channel: string
  startDate: string
  endDate: string
  lines: ParsedLine[]
  color: string
  /** 캠페인 라벨에서 기간을 못 읽어 사용자가 채워야 하는 상태 */
  needsDates: boolean
}

const MAX_SCAN_ROWS = 60
const MAX_IDLE_ROWS = 30
const TOTAL_PATTERNS = ['total', '소계', '합계', 'sub total', 'subtotal']

function text(cell: RawCell): string {
  if (cell === null || cell === undefined) return ''
  if (cell instanceof Date) return toDateString(cell)
  return String(cell).trim()
}

/** 헤더 비교용 — 공백·줄바꿈·특수문자 제거하고 소문자로 */
function normalize(cell: RawCell): string {
  return text(cell).toLowerCase().replace(/[\s\n\r()[\]{}%_.-]/g, '')
}

function num(cell: RawCell): number {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : 0
  const parsed = Number(text(cell).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function isTotalLabel(value: string): boolean {
  const lower = value.toLowerCase()
  return TOTAL_PATTERNS.some((p) => lower.includes(p))
}

/**
 * 표의 마지막 합계 행인가.
 * '8월 메가포 TOTAL' 같은 중간 소계와 구분해야 해서 정확히 'TOTAL'/'합계' 인 것만 본다.
 * 믹스 표 아래에는 일예산 시뮬레이션 같은 부속 표가 이어지므로 여기서 끊어야 한다.
 */
function isGrandTotalLabel(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[\s\n\r]/g, '')
  return normalized === 'total' || normalized === '합계' || normalized === '총계'
}

export function readMediaMixFile(buffer: ArrayBuffer): MediaMixSheet[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  return workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets[name], {
      header: 1,
      defval: null,
      blankrows: true,
    }),
  }))
}

const HEADER_HINTS = [
  '주요채널',
  '캠페인',
  '프로모션',
  '매체',
  'media',
  '목표',
  'objective',
  '타겟',
  'targeting',
  '일예산',
  'dailyspend',
  'mediaspend',
  'share',
]

/** 헤더 후보 키워드가 가장 많이 걸리는 행을 헤더로 본다. */
export function guessHeaderRow(rows: RawRow[]): number {
  let best = 0
  let bestScore = 0
  const limit = Math.min(rows.length, MAX_SCAN_ROWS)

  for (let i = 0; i < limit; i += 1) {
    const cells = rows[i] ?? []
    const score = cells.reduce<number>((acc, cell) => {
      const value = normalize(cell)
      if (!value) return acc
      return HEADER_HINTS.some((hint) => value.includes(hint)) ? acc + 1 : acc
    }, 0)
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return bestScore >= 3 ? best : 0
}

interface HeaderRule {
  field: keyof ColumnMap
  match: (value: string) => boolean
}

const HEADER_RULES: HeaderRule[] = [
  { field: 'channel', match: (v) => v.includes('주요채널') || v === '채널' },
  { field: 'campaign', match: (v) => v.includes('캠페인') && !v.includes('objective') },
  { field: 'campaign', match: (v) => v.includes('프로모션') },
  { field: 'media', match: (v) => v === '매체' || v === 'media' },
  { field: 'objective', match: (v) => v.includes('목표') || v.includes('objective') },
  { field: 'target', match: (v) => v.includes('타겟') || v.includes('target') },
  {
    field: 'budgetJp',
    match: (v) =>
      (v.includes('jp') && (v.includes('예산') || v.includes('spend'))) ||
      v.includes('mediaspendjp'),
  },
  {
    field: 'budgetKr',
    match: (v) => {
      if (v.includes('마크업포함') || v.includes('markup') || v.includes('gross')) return false
      return v.includes('kr예산') || v === 'mediaspend'
    },
  },
  { field: 'daily', match: (v) => v.includes('일예산') || v.includes('dailyspend') },
]

export function guessColumnMap(headerRow: RawRow): ColumnMap {
  const map: ColumnMap = {
    channel: EMPTY_COLUMN,
    campaign: EMPTY_COLUMN,
    media: EMPTY_COLUMN,
    objective: EMPTY_COLUMN,
    target: EMPTY_COLUMN,
    budgetJp: EMPTY_COLUMN,
    budgetKr: EMPTY_COLUMN,
    daily: EMPTY_COLUMN,
  }

  headerRow.forEach((cell, index) => {
    const value = normalize(cell)
    if (!value) return
    HEADER_RULES.forEach((rule) => {
      if (map[rule.field] === EMPTY_COLUMN && rule.match(value)) {
        map[rule.field] = index
      }
    })
  })

  // 캠페인 열을 못 찾으면 매체 열이 캠페인명을 겸하는 시트다(26.7 오피노 형식).
  if (map.campaign === EMPTY_COLUMN && map.media !== EMPTY_COLUMN) {
    map.campaign = map.media
  }
  return map
}

const DATE_RANGE = /(\d{1,2})\s*[/.]\s*(\d{1,2})\s*[-~–—]\s*(?:(\d{1,2})\s*[/.]\s*)?(\d{1,2})/

export interface LabelDates {
  startDate: string
  endDate: string
}

/**
 * '8월 메가포\n(8/1-9)' / '상시 광고 (8/10-8/23)' / '3분기 메가와리(8/15-9/9)' 에서
 * 기간을 뽑는다. 끝 월이 시작 월보다 작으면 해를 넘긴 것으로 본다.
 */
export function extractDates(label: string, baseYear: number): LabelDates | null {
  const matched = DATE_RANGE.exec(label)
  if (!matched) return null

  const startMonth = Number(matched[1])
  const startDay = Number(matched[2])
  const endMonth = matched[3] ? Number(matched[3]) : startMonth
  const endDay = Number(matched[4])
  if (!startMonth || !startDay || !endMonth || !endDay) return null
  if (startMonth > 12 || endMonth > 12 || startDay > 31 || endDay > 31) return null

  const endYear = endMonth < startMonth ? baseYear + 1 : baseYear
  return {
    startDate: toDateString(new Date(baseYear, startMonth - 1, startDay)),
    endDate: toDateString(new Date(endYear, endMonth - 1, endDay)),
  }
}

/** 라벨에서 기간 표기와 줄바꿈을 걷어낸 캠페인명 */
export function cleanCampaignName(label: string): string {
  return label
    .replace(/\(([^)]*\d{1,2}\s*[/.]\s*\d{1,2}[^)]*)\)/g, '')
    .replace(DATE_RANGE, '')
    .replace(/[\n\r]+/g, ' ')
    .replace(/\*.*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[(),]\s*$/, '')
    .trim()
}

/**
 * 산정일수 역산. 믹스안의 일예산 열이 있으면 `예산 ÷ 일예산` 으로 되돌린다.
 * 이 값이 캠페인 기간과 달라도 그대로 둔다 — 믹스안이 실제로 그렇게 잡아 둔 것이고,
 * 화면에서 ⚠ 로 표시한 뒤 사용자가 고치게 하는 게 합의된 방식이다.
 */
function deriveDays(budget: number, sheetDaily: number | null, fallback: number): number {
  if (!sheetDaily || sheetDaily <= 0 || budget <= 0) return fallback
  const days = Math.round(budget / sheetDaily)
  if (days < 1 || days > 400) return fallback
  return days
}

export interface ParseOptions {
  headerRow: number
  map: ColumnMap
  /** 캠페인 라벨의 월/일에 붙일 연도 */
  baseYear: number
  /** 라벨에서 기간을 못 읽었을 때 쓸 기본 기간 */
  fallbackStart: string
  fallbackEnd: string
}

export function parseCampaigns(rows: RawRow[], options: ParseOptions): ParsedCampaign[] {
  const { headerRow, map, baseYear, fallbackStart, fallbackEnd } = options
  const campaigns: ParsedCampaign[] = []

  let channel = ''
  let campaignLabel = ''
  let current: ParsedCampaign | null = null

  const startCampaign = (label: string): ParsedCampaign => {
    const dates = extractDates(label, baseYear)
    const name = cleanCampaignName(label) || label.replace(/[\n\r]+/g, ' ').trim()
    const campaign: ParsedCampaign = {
      key: `${campaigns.length}-${name}`,
      name,
      channel,
      startDate: dates?.startDate ?? fallbackStart,
      endDate: dates?.endDate ?? fallbackEnd,
      lines: [],
      color: CAMPAIGN_COLORS[campaigns.length % CAMPAIGN_COLORS.length],
      needsDates: !dates,
    }
    campaigns.push(campaign)
    return campaign
  }

  // 표가 끝났는지 보는 안전장치. 합계 행이 없는 시트도 있어서 공백 구간으로도 끊는다.
  let idleRows = 0

  for (let i = headerRow + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? []

    const rawChannel = map.channel === EMPTY_COLUMN ? '' : text(row[map.channel])
    const rawCampaign = map.campaign === EMPTY_COLUMN ? '' : text(row[map.campaign])

    // 표 끝. 아래로는 일예산 시뮬레이션 같은 다른 표가 이어진다.
    if (isGrandTotalLabel(rawChannel) || isGrandTotalLabel(rawCampaign)) break

    idleRows += 1
    if (idleRows > MAX_IDLE_ROWS) break

    // 병합 셀이라 값이 첫 행에만 있다. 아래로 이어 내려 준다.
    if (rawChannel) channel = rawChannel
    if (rawCampaign && rawCampaign !== campaignLabel) {
      campaignLabel = rawCampaign
      current = isTotalLabel(rawCampaign) ? null : startCampaign(rawCampaign)
    }

    // 소계 · 합계 행은 라인이 아니다.
    if (isTotalLabel(rawCampaign) || isTotalLabel(rawChannel)) continue
    if (!current) continue

    const budgetJp = map.budgetJp === EMPTY_COLUMN ? 0 : num(row[map.budgetJp])
    const budgetKr = map.budgetKr === EMPTY_COLUMN ? 0 : num(row[map.budgetKr])
    if (budgetJp <= 0 && budgetKr <= 0) continue

    const objective = map.objective === EMPTY_COLUMN ? '' : text(row[map.objective])
    if (isTotalLabel(objective)) continue

    const sheetDaily = map.daily === EMPTY_COLUMN ? null : num(row[map.daily]) || null
    const span = rangeDays(current.startDate, current.endDate)
    const days = deriveDays(budgetKr || budgetJp, sheetDaily, span)
    // 매체 열이 캠페인 열과 같은 시트(26.7 오피노 형식)에서는 매체를 읽을 수 없다.
    // 캠페인명을 매체로 넣어 두면 오히려 방해되니 비워 두고 화면에서 채우게 한다.
    const media =
      map.media === EMPTY_COLUMN || map.media === map.campaign ? '' : text(row[map.media])

    current.lines.push({
      media: media.replace(/[\n\r]+/g, ' ').trim() || '—',
      objective: objective.replace(/[\n\r]+/g, ' ').trim() || '—',
      target:
        map.target === EMPTY_COLUMN
          ? ''
          : text(row[map.target]).replace(/[\n\r]+/g, ' ').trim(),
      budgetJpNet: Math.round(budgetJp),
      budgetKrNet: Math.round(budgetKr),
      days,
      sheetDaily,
    })
    idleRows = 0
  }

  return campaigns.filter((c) => c.lines.length > 0)
}

/**
 * 매체·목표 열은 병합돼 있어서 그룹의 첫 행에만 값이 있다.
 * (예: s-meta 가 세 행에 걸쳐 있고 Purchase 가 두 행에 걸쳐 있음)
 * 비어 있는 칸은 바로 위 라인 값을 물려받는다.
 */
export function fillDownMerged(campaigns: ParsedCampaign[]): ParsedCampaign[] {
  return campaigns.map((campaign) => {
    let lastMedia = '—'
    let lastObjective = '—'
    return {
      ...campaign,
      lines: campaign.lines.map((line) => {
        if (line.media && line.media !== '—') lastMedia = line.media
        if (line.objective && line.objective !== '—') lastObjective = line.objective
        return { ...line, media: lastMedia, objective: lastObjective }
      }),
    }
  })
}
