import {
  collection,
  getDocs,
  getDoc,
  setDoc,
  doc,
  query,
  orderBy,
  limit,
  where,
  Timestamp,
} from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { Influencer, InfluencerAppearance } from '@/types'

// ── 타입 변환 ─────────────────────────────────────────────────
function convertTimestamp(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate()
  if (ts instanceof Date) return ts
  return new Date()
}

function docToInfluencer(d: { id: string; data: () => Record<string, unknown> }): Influencer {
  const data = d.data()
  return {
    id: d.id,
    handle: (data.handle as string) ?? '',
    platform: (data.platform as string) ?? '',
    profileUrl: (data.profileUrl as string) ?? '',
    followers: (data.followers as number) ?? 0,
    appearances: (data.appearances as InfluencerAppearance[]) ?? [],
    firstSeenAt: convertTimestamp(data.firstSeenAt),
    lastSeenAt: convertTimestamp(data.lastSeenAt),
    updatedAt: convertTimestamp(data.updatedAt),
  }
}

// ── URL → Firestore 문서 ID 정규화 ────────────────────────────
// e.g. instagram.com/username → "instagram_username"
export function normalizeInfluencerId(url: string, platform: string, handle: string): string {
  if (url) {
    const patterns: [RegExp, string][] = [
      [/instagram\.com\/([^/?#\s]+)/i, 'instagram'],
      [/tiktok\.com\/@?([^/?#\s]+)/i, 'tiktok'],
      [/youtube\.com\/@([^/?#\s]+)/i, 'youtube'],
      [/youtube\.com\/channel\/([^/?#\s]+)/i, 'youtube'],
      [/(?:x|twitter)\.com\/([^/?#\s]+)/i, 'x'],
    ]
    for (const [re, plt] of patterns) {
      const m = url.match(re)
      if (m) {
        const username = m[1].toLowerCase().replace(/[^a-z0-9._-]/g, '_').slice(0, 60)
        return `${plt}_${username}`
      }
    }
  }

  const platformKey = (platform || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '_')
  const handleKey = handle
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9._-]/g, '_')
    .slice(0, 60) || 'unknown'
  return `${platformKey}_${handleKey}`
}

// ── Upsert (새 캠페인 appearance 추가 / 기존이면 갱신) ─────────
export async function upsertInfluencer(
  id: string,
  data: { handle: string; platform: string; profileUrl: string; followers: number },
  appearance: InfluencerAppearance
): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) return

  try {
    const ref = doc(db, 'influencers', id)
    const snap = await getDoc(ref)
    const now = Timestamp.now()

    if (snap.exists()) {
      const existing = snap.data() as Record<string, unknown>
      const appearances = (existing.appearances as InfluencerAppearance[]) ?? []
      // 동일 캠페인 appearance는 덮어쓰기, 새 캠페인이면 추가
      const alreadyIdx = appearances.findIndex((a) => a.campaignId === appearance.campaignId)
      const newAppearances =
        alreadyIdx >= 0
          ? appearances.map((a, i) => (i === alreadyIdx ? appearance : a))
          : [...appearances, appearance]

      await setDoc(
        ref,
        {
          handle: data.handle || existing.handle,
          platform: data.platform || existing.platform,
          profileUrl: data.profileUrl || existing.profileUrl,
          followers: data.followers > 0 ? data.followers : (existing.followers ?? 0),
          appearances: newAppearances,
          lastSeenAt: now,
          updatedAt: now,
        },
        { merge: true }
      )
    } else {
      await setDoc(ref, {
        handle: data.handle,
        platform: data.platform,
        profileUrl: data.profileUrl,
        followers: data.followers,
        appearances: [appearance],
        firstSeenAt: now,
        lastSeenAt: now,
        updatedAt: now,
      })
    }
  } catch (err) {
    console.error('인플루언서 upsert 오류:', err)
  }
}

// ── 목록 조회 ────────────────────────────────────────────────
export async function getInfluencers(limitCount = 300): Promise<Influencer[]> {
  const db = getFirestoreInstance()
  if (!db) return []
  try {
    const q = query(
      collection(db, 'influencers'),
      orderBy('lastSeenAt', 'desc'),
      limit(limitCount)
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => docToInfluencer(d as Parameters<typeof docToInfluencer>[0]))
  } catch (error) {
    console.error('인플루언서 목록 조회 오류:', error)
    return []
  }
}

// ── 플랫폼 필터 + 팔로워 최소값 검색 ─────────────────────────
export async function searchInfluencers(
  platform?: string,
  minFollowers = 0
): Promise<Influencer[]> {
  const db = getFirestoreInstance()
  if (!db) return []
  try {
    const q = platform
      ? query(
          collection(db, 'influencers'),
          where('platform', '==', platform),
          orderBy('followers', 'desc'),
          limit(500)
        )
      : query(collection(db, 'influencers'), orderBy('followers', 'desc'), limit(500))

    const snap = await getDocs(q)
    return snap.docs
      .map((d) => docToInfluencer(d as Parameters<typeof docToInfluencer>[0]))
      .filter((inf) => inf.followers >= minFollowers)
  } catch (error) {
    console.error('인플루언서 검색 오류:', error)
    return []
  }
}
