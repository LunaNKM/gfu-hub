import {
  CampaignDataColumn,
  CampaignDataRow,
  CampaignDataTableContent,
  CampaignCrmSyncType,
} from '@/types'

// ── 템플릿 컬럼 정의 ─────────────────────────────────────────────

const CANDIDATE_LIST_COLUMNS: CampaignDataColumn[] = [
  { id: 'handle',       name: '계정명',    type: 'text',     role: 'dimension' },
  { id: 'platform',     name: '플랫폼',    type: 'select',   role: 'platform',  options: ['Instagram', 'TikTok', 'YouTube', 'X'] },
  { id: 'followers',    name: '팔로워 수', type: 'number',   role: 'metric' },
  { id: 'estimatedFee', name: '예상 단가', type: 'currency', role: 'cost' },
  { id: 'status',       name: '상태',      type: 'select',   role: 'status',    options: ['후보', '검토중', '제안', '확정', '보류', '제외'] },
  { id: 'confirmed',    name: '확정 여부', type: 'checkbox', role: 'status' },
  { id: 'notes',        name: '비고',      type: 'text' },
]

const CONFIRMED_LIST_COLUMNS: CampaignDataColumn[] = [
  { id: 'influencer',     name: '인플루언서',    type: 'text',     role: 'dimension' },
  { id: 'platform',       name: '플랫폼',        type: 'select',   role: 'platform', options: ['Instagram', 'TikTok', 'YouTube', 'X'] },
  { id: 'contentType',    name: '콘텐츠 유형',   type: 'select',   role: 'dimension', options: ['Reels', 'Feed', 'Story', 'Shorts', 'TikTok', 'YouTube'] },
  { id: 'contractFee',    name: '계약 금액',     type: 'currency', role: 'cost' },
  { id: 'uploadDate',     name: '업로드 예정일', type: 'date' },
  { id: 'progressStatus', name: '진행 상태',     type: 'select',   role: 'status',   options: ['계약전', '계약완료', '초안대기', '검수중', '업로드완료'] },
  { id: 'notes',          name: '비고',          type: 'text' },
]

const PERFORMANCE_COLUMNS: CampaignDataColumn[] = [
  { id: 'influencer', name: '인플루언서',  type: 'text',    role: 'dimension' },
  { id: 'platform',   name: '플랫폼',      type: 'select',  role: 'platform', options: ['Instagram', 'TikTok', 'YouTube', 'X'] },
  { id: 'contentUrl', name: '콘텐츠 URL',  type: 'url' },
  { id: 'views',      name: '조회수',      type: 'number',  role: 'performance' },
  { id: 'likes',      name: '좋아요',      type: 'number',  role: 'performance' },
  { id: 'comments',   name: '댓글',        type: 'number',  role: 'performance' },
  { id: 'saves',      name: '저장',        type: 'number',  role: 'performance' },
  { id: 'er',         name: 'ER',          type: 'percent', role: 'metric' },
]

const GENERIC_COLUMNS: CampaignDataColumn[] = [
  { id: 'item',     name: '항목',   type: 'text',   role: 'dimension' },
  { id: 'status',   name: '상태',   type: 'select', role: 'status', options: ['예정', '진행중', '완료', '보류'] },
  { id: 'assignee', name: '담당자', type: 'text' },
  { id: 'deadline', name: '마감일', type: 'date' },
  { id: 'notes',    name: '비고',   type: 'text' },
]

// ── 기본 컨텐츠 생성 ─────────────────────────────────────────────

export function createDefaultTableContent(params: {
  title?: string
  crmSyncType?: CampaignCrmSyncType | string
}): CampaignDataTableContent {
  let columns: CampaignDataColumn[]

  if (params.crmSyncType === 'confirmed_influencers') {
    columns = CONFIRMED_LIST_COLUMNS
  } else if (params.crmSyncType === 'influencer_performance') {
    columns = PERFORMANCE_COLUMNS
  } else if (params.title && (params.title.includes('후보') || params.title.includes('캐스팅'))) {
    columns = CANDIDATE_LIST_COLUMNS
  } else {
    columns = GENERIC_COLUMNS
  }

  return { columns, rows: [] }
}

// ── 행 생성 유틸 ─────────────────────────────────────────────────

export function createEmptyRow(columns: CampaignDataColumn[]): CampaignDataRow {
  const cells: CampaignDataRow['cells'] = {}
  for (const col of columns) {
    cells[col.id] = null
  }
  return {
    id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    cells,
  }
}

export function createSampleRows(columns: CampaignDataColumn[]): CampaignDataRow[] {
  const today = new Date().toISOString().split('T')[0]

  function sampleValue(col: CampaignDataColumn): string | number | boolean | null {
    switch (col.type) {
      case 'text':     return col.role === 'dimension' ? '예시 항목' : ''
      case 'number':   return col.role === 'performance' ? 10000 : 1000
      case 'currency': return 500000
      case 'percent':  return 3.5
      case 'date':     return today
      case 'checkbox': return false
      case 'url':      return ''
      case 'select':   return col.options?.[0] ?? ''
      default:         return null
    }
  }

  const cells: CampaignDataRow['cells'] = {}
  for (const col of columns) {
    cells[col.id] = sampleValue(col)
  }
  return [{ id: `row_sample_${Date.now()}`, cells }]
}
