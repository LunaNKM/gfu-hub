import { AdCampaign, AdCampaignLine } from '@/types'

/**
 * 광고 캘린더 계산 규약
 *
 * - 예산은 모두 "넷"(마크업 제외)이다. 마크업 포함 금액은 다루지 않는다.
 * - 일예산 = 넷 매체비 ÷ 산정일수(`line.days`).
 *   `days` 는 미디어믹스가 실제로 나눈 일수라서 캠페인 표기 기간과 다를 수 있고,
 *   그럴 때는 믹스안 값을 그대로 쓰고 화면에 경고만 띄운다. (docs/ad-calendar.md)
 */

export type AdCurrency = 'JPY' | 'KRW'

export const CURRENCY_META: Record<AdCurrency, { symbol: string; unit: string; label: string }> = {
  JPY: { symbol: '¥', unit: '万', label: 'JP 넷' },
  KRW: { symbol: '₩', unit: '만', label: 'KR 넷' },
}

export function lineBudget(line: AdCampaignLine, currency: AdCurrency): number {
  return currency === 'JPY' ? line.budgetJpNet : line.budgetKrNet
}

export function lineDaily(line: AdCampaignLine, currency: AdCurrency): number {
  return lineBudget(line, currency) / Math.max(line.days, 1)
}

export function campaignLines(
  campaign: AdCampaign,
  mediaFilter?: Set<string>
): AdCampaignLine[] {
  if (!mediaFilter || mediaFilter.size === 0) return campaign.lines
  return campaign.lines.filter((l) => mediaFilter.has(l.media))
}

export function campaignDaily(
  campaign: AdCampaign,
  currency: AdCurrency,
  mediaFilter?: Set<string>
): number {
  return campaignLines(campaign, mediaFilter).reduce((sum, l) => sum + lineDaily(l, currency), 0)
}

export function campaignBudget(
  campaign: AdCampaign,
  currency: AdCurrency,
  mediaFilter?: Set<string>
): number {
  return campaignLines(campaign, mediaFilter).reduce((sum, l) => sum + lineBudget(l, currency), 0)
}

export function formatMoney(value: number, currency: AdCurrency): string {
  return CURRENCY_META[currency].symbol + Math.round(value).toLocaleString('ko-KR')
}

/** 달력 칸처럼 좁은 자리용. 1만 이상이면 万/만 단위로 줄인다. */
export function formatCompact(value: number, currency: AdCurrency): string {
  const { symbol, unit } = CURRENCY_META[currency]
  if (Math.abs(value) >= 10000) return `${symbol}${(value / 10000).toFixed(1)}${unit}`
  return symbol + Math.round(value).toLocaleString('ko-KR')
}

// ===== 날짜 =====
// Firestore 에는 'YYYY-MM-DD' 문자열로 저장한다. Date 로 변환할 때는 항상
// 로컬 자정으로 만들어야 UTC 파싱 때문에 하루 밀리는 일이 없다.

export function toDateString(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

export function parseDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000)
}

/** 시작일과 종료일을 모두 포함한 일수 */
export function rangeDays(startDate: string, endDate: string): number {
  return diffDays(parseDate(startDate), parseDate(endDate)) + 1
}

export function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** 캠페인이 걸치는 모든 달. Firestore array-contains 조회용. */
export function monthKeysBetween(startDate: string, endDate: string): string[] {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  const keys: string[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cursor <= end) {
    keys.push(toMonthKey(cursor))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return keys
}

/** 라인 자체 기간이 있으면 그것을, 없으면 캠페인 기간을 쓴다. */
export function lineRange(campaign: AdCampaign, line: AdCampaignLine): [string, string] {
  return [line.startDate ?? campaign.startDate, line.endDate ?? campaign.endDate]
}

export function isLineActiveOn(campaign: AdCampaign, line: AdCampaignLine, day: string): boolean {
  const [start, end] = lineRange(campaign, line)
  return day >= start && day <= end
}

export function isCampaignActiveOn(campaign: AdCampaign, day: string): boolean {
  return day >= campaign.startDate && day <= campaign.endDate
}

/** 산정일수가 라인 실제 기간과 어긋나는가 — 화면의 ⚠ 판단 기준 */
export function isLineDaysMismatched(campaign: AdCampaign, line: AdCampaignLine): boolean {
  const [start, end] = lineRange(campaign, line)
  return line.days !== rangeDays(start, end)
}

export function hasDaysMismatch(campaign: AdCampaign): boolean {
  return campaign.lines.some((l) => isLineDaysMismatched(campaign, l))
}

/** 그날 실제로 켜져 있어야 하는 일예산 합계 */
export function dailyBudgetOn(
  campaigns: AdCampaign[],
  day: string,
  currency: AdCurrency,
  mediaFilter?: Set<string>
): number {
  return campaigns.reduce((sum, campaign) => {
    if (!isCampaignActiveOn(campaign, day)) return sum
    return (
      sum +
      campaignLines(campaign, mediaFilter)
        .filter((line) => isLineActiveOn(campaign, line, day))
        .reduce((acc, line) => acc + lineDaily(line, currency), 0)
    )
  }, 0)
}

export function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const MEDIA_BADGE_CLASS: Record<string, string> = {
  's-meta': 'bg-indigo-50 text-indigo-700',
  meta: 'bg-sky-50 text-sky-700',
  META: 'bg-sky-50 text-sky-700',
  X: 'bg-slate-100 text-slate-700',
  TikTok: 'bg-pink-50 text-pink-700',
}

export function mediaBadgeClass(media: string): string {
  return MEDIA_BADGE_CLASS[media] ?? 'bg-gray-100 text-gray-600'
}

/** 브랜드 추가 시 순서대로 집어 주는 기본 색 */
export const BRAND_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#f43f5e',
  '#0ea5e9',
  '#84cc16',
  '#ec4899',
]

/** 캠페인 바 색. 브랜드 색과 구분되도록 별도로 고른다. */
export const CAMPAIGN_COLORS = [
  '#3b82f6',
  '#10b981',
  '#8b5cf6',
  '#f59e0b',
  '#f43f5e',
  '#0ea5e9',
]
