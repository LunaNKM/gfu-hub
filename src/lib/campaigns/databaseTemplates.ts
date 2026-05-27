import {
  CampaignBusinessType,
  CampaignDatabase,
  CampaignDataColumn,
  CampaignDataRow,
  CampaignDataTableContent,
  CampaignCrmSyncType,
} from '@/types'
import { autoColor } from '@/lib/palette'

// ── 컬럼 생성 헬퍼 ────────────────────────────────────────────────

function col(
  id: string,
  name: string,
  type: CampaignDataColumn['type'],
  role?: CampaignDataColumn['role'],
  options?: string[]
): CampaignDataColumn {
  const c: CampaignDataColumn = { id, name, type }
  if (role) c.role = role
  if (options) c.options = options.map((v) => ({ value: v, color: autoColor(v) }))
  return c
}

// ── 비즈니스 타입별 기본 색상 ─────────────────────────────────────

const BUSINESS_TYPE_COLORS: Record<CampaignBusinessType, string> = {
  strategy_overview:       'slate',
  influencer_candidates:   'indigo',
  confirmed_influencers:   'green',
  influencer_performance:  'orange',
  reels_feed_plan:         'sky',
  orientation_sheet:       'teal',
  ad_budget:               'yellow',
  ad_execution_plan:       'gold',
  schedule:                'cyan',
  content_review:          'purple',
  result_report:           'pink',
  meta_analytics:          'blue',
  other:                   'gray',
}

// ── 빈 행 생성 ────────────────────────────────────────────────────

export function createEmptyDbRow(columns: CampaignDataColumn[]): CampaignDataRow {
  const cells: CampaignDataRow['cells'] = {}
  columns.forEach((c) => { cells[c.id] = null })
  return { id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, cells }
}

// ── ER 계산 헬퍼 ──────────────────────────────────────────────────

export function computeInfluencerEr(row: CampaignDataRow): number | null {
  const get = (key: string): number | null => {
    const v = row.cells[key]
    return typeof v === 'number' ? v : null
  }
  const followers = get('followers')
  if (!followers || followers === 0) return null

  const engagement = ['likes', 'saves', 'comments', 'shares', 'reposts']
    .map(get)
    .filter((v): v is number => v !== null)
    .reduce((a, b) => a + b, 0)

  return Math.round((engagement / followers) * 10000) / 100
}

// ── 비즈니스 타입별 기본 컬럼 ─────────────────────────────────────

export const BUSINESS_TYPE_COLUMNS: Record<CampaignBusinessType, CampaignDataColumn[]> = {
  influencer_candidates: [
    col('name',      '계정명',    'text',   'dimension'),
    col('url',       'URL',       'url'),
    col('followers', '팔로워 수', 'number', 'metric'),
    col('platform',  '플랫폼',    'select', 'platform', ['Instagram', 'TikTok', 'YouTube', 'X']),
    col('category',  '카테고리',  'select', 'dimension'),
    col('confirmed', '확정 여부', 'checkbox','status'),
    col('note',      '비고',      'text'),
  ],

  confirmed_influencers: [
    col('name',      '계정명',    'text',   'dimension'),
    col('url',       'URL',       'url'),
    col('followers', '팔로워 수', 'number', 'metric'),
    col('platform',  '플랫폼',    'select', 'platform', ['Instagram', 'TikTok', 'YouTube', 'X']),
    col('category',  '카테고리',  'select', 'dimension'),
    col('status',    '현재 상태', 'select', 'status', ['계약전', '계약완료', '초안대기', '검수중', '업로드완료']),
    col('note',      '비고',      'text'),
  ],

  influencer_performance: [
    col('name',      '계정명',    'text',   'dimension'),
    col('url',       'URL',       'url'),
    col('followers', '팔로워 수', 'number', 'metric'),
    col('platform',  '플랫폼',    'select', 'platform', ['Instagram', 'TikTok', 'YouTube', 'X']),
    col('category',  '카테고리',  'select', 'dimension'),
    col('views',     '조회수',    'number', 'performance'),
    col('likes',     '좋아요',    'number', 'performance'),
    col('saves',     '저장',      'number', 'performance'),
    col('comments',  '댓글',      'number', 'performance'),
    col('shares',    '공유',      'number', 'performance'),
    col('reposts',   '리포스트',  'number', 'performance'),
    col('er',        'ER',        'percent','metric'),
  ],

  ad_budget: [
    col('item',          '항목',       'text',     'dimension'),
    col('channel',       '채널',       'select',   'platform'),
    col('purpose',       '목적',       'select',   'dimension'),
    col('budget',        '예산',       'currency', 'cost'),
    col('est_cpm',       '예상 CPM',   'currency', 'metric'),
    col('est_cpc',       '예상 CPC',   'currency', 'metric'),
    col('est_impr',      '예상 노출',  'number',   'metric'),
    col('est_click',     '예상 클릭',  'number',   'metric'),
    col('note',          '비고',       'text'),
  ],

  // 나머지 타입은 기본 범용 컬럼
  strategy_overview: [
    col('title', '제목', 'text', 'dimension'),
    col('content', '내용', 'text'),
    col('status', '상태', 'select', 'status'),
  ],
  reels_feed_plan: [
    col('name', '계정명', 'text', 'dimension'),
    col('platform', '플랫폼', 'select', 'platform', ['Instagram', 'TikTok', 'YouTube', 'X']),
    col('format', '포맷', 'select', 'dimension', ['릴스', '피드', '스토리', '쇼츠']),
    col('due_date', '마감일', 'date'),
    col('status', '상태', 'select', 'status'),
    col('note', '비고', 'text'),
  ],
  orientation_sheet: [
    col('name', '계정명', 'text', 'dimension'),
    col('platform', '플랫폼', 'select', 'platform', ['Instagram', 'TikTok', 'YouTube', 'X']),
    col('briefing_date', '브리핑일', 'date'),
    col('confirmed', '확인 여부', 'checkbox', 'status'),
    col('note', '비고', 'text'),
  ],
  ad_execution_plan: [
    col('item', '항목', 'text', 'dimension'),
    col('channel', '채널', 'select', 'platform'),
    col('start_date', '시작일', 'date'),
    col('end_date', '종료일', 'date'),
    col('budget', '예산', 'currency', 'cost'),
    col('status', '상태', 'select', 'status'),
    col('note', '비고', 'text'),
  ],
  schedule: [
    col('name', '항목', 'text', 'dimension'),
    col('date', '날짜', 'date'),
    col('assignee', '담당자', 'text'),
    col('status', '상태', 'select', 'status', ['예정', '완료', '지연']),
    col('note', '비고', 'text'),
  ],
  content_review: [
    col('name', '계정명', 'text', 'dimension'),
    col('platform', '플랫폼', 'select', 'platform', ['Instagram', 'TikTok', 'YouTube', 'X']),
    col('draft_url', '초안 URL', 'url'),
    col('review_date', '검수일', 'date'),
    col('status', '상태', 'select', 'status', ['제출전', '검수중', '수정요청', '승인']),
    col('note', '비고', 'text'),
  ],
  result_report: [
    col('name', '계정명', 'text', 'dimension'),
    col('platform', '플랫폼', 'select', 'platform', ['Instagram', 'TikTok', 'YouTube', 'X']),
    col('views', '조회수', 'number', 'performance'),
    col('er', 'ER', 'percent', 'metric'),
    col('post_url', '게시물 URL', 'url'),
    col('note', '비고', 'text'),
  ],
  meta_analytics: [
    col('level', 'Level', 'select', 'dimension', ['campaign', 'adset', 'ad']),
    col('name', 'Name', 'text', 'dimension'),
    col('spend', 'Spend', 'currency', 'cost'),
    col('impressions', 'Impressions', 'number', 'performance'),
    col('reach', 'Reach', 'number', 'performance'),
    col('clicks', 'Clicks', 'number', 'performance'),
    col('ctr', 'CTR', 'percent', 'metric'),
    col('cpc', 'CPC', 'currency', 'metric'),
    col('cpm', 'CPM', 'currency', 'metric'),
    col('conversions', 'Conversions', 'number', 'performance'),
    col('video_play', 'Video Play', 'number', 'performance'),
    col('thruplay', 'ThruPlay', 'number', 'performance'),
  ],
  other: [
    col('name', '항목', 'text', 'dimension'),
    col('value', '값', 'text'),
    col('note', '비고', 'text'),
  ],
}

// ── 기본 데이터베이스 생성 ─────────────────────────────────────────

const BUSINESS_TYPE_TITLES: Record<CampaignBusinessType, string> = {
  strategy_overview:       '전략 개요',
  influencer_candidates:   '후보자 리스트',
  confirmed_influencers:   '확정 인원 리스트',
  influencer_performance:  '인플루언서 성과',
  reels_feed_plan:         '릴스/피드 플랜',
  orientation_sheet:       '오리엔테이션 시트',
  ad_budget:               '광고 예산안',
  ad_execution_plan:       '광고 집행 플랜',
  schedule:                '일정표',
  content_review:          '콘텐츠 검수',
  result_report:           '결과 리포트',
  meta_analytics:          'Meta Analytics',
  other:                   '기타',
}

export function createDefaultDatabase(params: {
  campaignId: string
  businessType: CampaignBusinessType
  title?: string
  order?: number
  userId: string
}): Omit<CampaignDatabase, 'id'> {
  const { campaignId, businessType, title, order = 1000, userId } = params
  const now = new Date().toISOString()
  const columns = BUSINESS_TYPE_COLUMNS[businessType] ?? BUSINESS_TYPE_COLUMNS.other

  return {
    campaignId,
    title: title ?? BUSINESS_TYPE_TITLES[businessType],
    businessType,
    order,
    columns,
    rows: [],
    color: BUSINESS_TYPE_COLORS[businessType] ?? 'gray',
    clientVisible: false,
    clientEditable: false,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId,
  }
}

export const DEFAULT_DATABASE_TYPES: CampaignBusinessType[] = [
  'influencer_candidates',
  'confirmed_influencers',
  'influencer_performance',
  'ad_budget',
]

export { BUSINESS_TYPE_TITLES }

export function createDefaultTableContent(params: {
  title?: string
  crmSyncType?: CampaignCrmSyncType | string
  businessType?: CampaignBusinessType
}): CampaignDataTableContent {
  let businessType = params.businessType

  if (!businessType && params.crmSyncType === 'confirmed_influencers') {
    businessType = 'confirmed_influencers'
  }
  if (!businessType && params.crmSyncType === 'influencer_performance') {
    businessType = 'influencer_performance'
  }

  return {
    columns: BUSINESS_TYPE_COLUMNS[businessType ?? 'other'] ?? BUSINESS_TYPE_COLUMNS.other,
    rows: [],
  }
}
