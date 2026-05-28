/**
 * Meta 광고 계정 ID 정규화 헬퍼.
 * act_ prefix가 없으면 붙인다.
 * 서버(API route)와 클라이언트(hook) 양쪽에서 공유한다.
 */
export function normalizeMetaAdAccountId(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`
}
