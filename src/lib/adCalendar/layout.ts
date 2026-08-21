import { AdCampaign } from '@/types'
import { addDays, diffDays, parseDate } from './format'

/** 달력 한 줄(주 또는 한 달) 안에서 캠페인 바가 차지하는 칸 */
export interface BarSegment {
  campaign: AdCampaign
  /** 1부터 시작하는 grid-column 시작 위치 */
  column: number
  span: number
  /** 이 줄 앞에서부터 이어지는가 */
  continuesBefore: boolean
  /** 이 줄 뒤로 이어지는가 */
  continuesAfter: boolean
}

/** [rangeStart, rangeEnd] 구간에 걸치는 캠페인을 잘라 바 조각으로 만든다. */
export function buildSegments(
  campaigns: AdCampaign[],
  rangeStart: Date,
  rangeEnd: Date
): BarSegment[] {
  return campaigns
    .map((campaign) => {
      const start = parseDate(campaign.startDate)
      const end = parseDate(campaign.endDate)
      if (end < rangeStart || start > rangeEnd) return null

      const visibleStart = start > rangeStart ? start : rangeStart
      const visibleEnd = end < rangeEnd ? end : rangeEnd
      return {
        campaign,
        column: diffDays(rangeStart, visibleStart) + 1,
        span: diffDays(visibleStart, visibleEnd) + 1,
        continuesBefore: start < rangeStart,
        continuesAfter: end > rangeEnd,
      }
    })
    .filter((segment): segment is BarSegment => segment !== null)
}

/** 겹치지 않는 바끼리 같은 줄에 몰아넣는다. 긴 바가 위로 오도록 정렬해서 담는다. */
export function packLanes(segments: BarSegment[]): BarSegment[][] {
  const lanes: BarSegment[][] = []
  const sorted = [...segments].sort((a, b) => a.column - b.column || b.span - a.span)

  sorted.forEach((segment) => {
    const segmentEnd = segment.column + segment.span - 1
    const laneIndex = lanes.findIndex((lane) =>
      lane.every((other) => {
        const otherEnd = other.column + other.span - 1
        return segment.column > otherEnd || segmentEnd < other.column
      })
    )
    if (laneIndex >= 0) lanes[laneIndex].push(segment)
    else lanes.push([segment])
  })

  return lanes
}

/** 달력 격자에 그릴 날짜들. 주 시작은 월요일. (미디어믹스 캘린더 시트와 동일) */
export function buildMonthWeeks(month: Date): Date[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const gridStart = addDays(first, -offset)
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const weekCount = Math.ceil((offset + daysInMonth) / 7)

  return Array.from({ length: weekCount }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(gridStart, week * 7 + day))
  )
}
