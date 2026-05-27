export interface PaletteColor {
  id: string
  label: string
  bg: string      // 진한 배경 (컬러 바, 선택된 닷)
  bgSoft: string  // 연한 배경 (칩 기본)
  text: string    // bgSoft 위 글자색
  border: string  // 칩 테두리
}

export const PALETTE: PaletteColor[] = [
  { id: 'gray',    label: '회색',     bg: '#6b7280', bgSoft: '#f3f4f6', text: '#374151', border: '#d1d5db' },
  { id: 'slate',   label: '슬레이트', bg: '#475569', bgSoft: '#f1f5f9', text: '#1e293b', border: '#cbd5e1' },
  { id: 'brown',   label: '갈색',     bg: '#92400e', bgSoft: '#fef3c7', text: '#78350f', border: '#fde68a' },
  { id: 'orange',  label: '주황',     bg: '#ea580c', bgSoft: '#ffedd5', text: '#9a3412', border: '#fed7aa' },
  { id: 'gold',    label: '골드',     bg: '#ca8a04', bgSoft: '#fefce8', text: '#713f12', border: '#fef08a' },
  { id: 'yellow',  label: '노랑',     bg: '#d97706', bgSoft: '#fef9c3', text: '#92400e', border: '#fde047' },
  { id: 'lime',    label: '라임',     bg: '#65a30d', bgSoft: '#f7fee7', text: '#3f6212', border: '#d9f99d' },
  { id: 'green',   label: '초록',     bg: '#16a34a', bgSoft: '#dcfce7', text: '#166534', border: '#bbf7d0' },
  { id: 'teal',    label: '청록',     bg: '#0d9488', bgSoft: '#ccfbf1', text: '#134e4a', border: '#99f6e4' },
  { id: 'cyan',    label: '시안',     bg: '#0891b2', bgSoft: '#cffafe', text: '#164e63', border: '#a5f3fc' },
  { id: 'sky',     label: '하늘',     bg: '#0284c7', bgSoft: '#e0f2fe', text: '#0c4a6e', border: '#bae6fd' },
  { id: 'blue',    label: '파랑',     bg: '#2563eb', bgSoft: '#dbeafe', text: '#1e3a8a', border: '#bfdbfe' },
  { id: 'indigo',  label: '인디고',   bg: '#4f46e5', bgSoft: '#e0e7ff', text: '#312e81', border: '#c7d2fe' },
  { id: 'purple',  label: '보라',     bg: '#7c3aed', bgSoft: '#f3e8ff', text: '#581c87', border: '#e9d5ff' },
  { id: 'pink',    label: '핑크',     bg: '#db2777', bgSoft: '#fce7f3', text: '#831843', border: '#fbcfe8' },
  { id: 'hotpink', label: '핫핑크',   bg: '#ec4899', bgSoft: '#fdf2f8', text: '#9d174d', border: '#f9a8d4' },
  { id: 'red',     label: '빨강',     bg: '#dc2626', bgSoft: '#fee2e2', text: '#7f1d1d', border: '#fecaca' },
]

const PALETTE_MAP = new Map(PALETTE.map((c) => [c.id, c]))

export function getColor(id: string): PaletteColor {
  return PALETTE_MAP.get(id) ?? PALETTE[0]
}

export function autoColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length].id
}
