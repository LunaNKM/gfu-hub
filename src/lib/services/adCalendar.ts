import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { AdCalendarBrand, AdCampaign } from '@/types'
import { monthKeysBetween } from '../adCalendar/format'

const BRANDS = 'adCalendarBrands'
const CAMPAIGNS = 'adCalendarCampaigns'

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return new Date()
}

// ===== 브랜드 =====

export async function getAdCalendarBrands(): Promise<AdCalendarBrand[]> {
  const db = getFirestoreInstance()
  if (!db) return []

  const snapshot = await getDocs(query(collection(db, BRANDS), orderBy('order', 'asc')))
  return snapshot.docs.map((d) => {
    const data = d.data()
    return {
      ...data,
      id: d.id,
      archived: data.archived ?? false,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    } as AdCalendarBrand
  })
}

export type AdBrandInput = Omit<
  AdCalendarBrand,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'
>

export async function createAdCalendarBrand(
  data: AdBrandInput,
  userId: string
): Promise<string> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  const ref = await addDoc(collection(db, BRANDS), {
    ...data,
    createdBy: userId,
    updatedBy: userId,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateAdCalendarBrand(
  id: string,
  data: Partial<AdBrandInput>,
  userId: string
): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  await updateDoc(doc(db, BRANDS, id), {
    ...data,
    updatedBy: userId,
    updatedAt: Timestamp.now(),
  })
}

/**
 * 브랜드를 지우면 그 브랜드의 캠페인이 어디에도 안 붙은 채로 남으므로 함께 지운다.
 * 보관만 하고 싶으면 archived 를 쓴다.
 */
export async function deleteAdCalendarBrand(id: string): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  const owned = await getDocs(query(collection(db, CAMPAIGNS), where('brandId', '==', id)))
  const batch = writeBatch(db)
  owned.docs.forEach((d) => batch.delete(d.ref))
  batch.delete(doc(db, BRANDS, id))
  await batch.commit()
}

// ===== 캠페인 =====

function normalizeCampaign(id: string, data: Record<string, unknown>): AdCampaign {
  const source = data.source as { fileName: string; sheetName: string; importedAt: unknown } | undefined
  return {
    ...(data as object),
    id,
    lines: (data.lines as AdCampaign['lines']) ?? [],
    months: (data.months as string[]) ?? [],
    source: source ? { ...source, importedAt: toDate(source.importedAt) } : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as AdCampaign
}

/**
 * 월별 조회. Firestore 는 startDate/endDate 두 필드에 동시에 범위 조건을 못 걸어서
 * 저장 시점에 펼쳐 둔 months 배열로 찾는다. (docs/ad-calendar.md)
 *
 * 정렬은 클라이언트에서 한다. array-contains 에 orderBy 를 붙이면 복합 인덱스를
 * 따로 배포해야 하는데, 한 달 캠페인은 많아야 수십 건이라 그럴 이유가 없다.
 */
export async function getAdCampaignsByMonth(monthKey: string): Promise<AdCampaign[]> {
  const db = getFirestoreInstance()
  if (!db) return []

  const snapshot = await getDocs(
    query(collection(db, CAMPAIGNS), where('months', 'array-contains', monthKey))
  )
  return snapshot.docs
    .map((d) => normalizeCampaign(d.id, d.data()))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
}

export type AdCampaignInput = Omit<
  AdCampaign,
  'id' | 'months' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'
>

function withDerivedFields(data: AdCampaignInput) {
  const { source, targetRoas, memo, ...rest } = data
  return {
    ...rest,
    // undefined 를 그대로 넣으면 Firestore 가 거부한다.
    ...(targetRoas === undefined ? {} : { targetRoas }),
    ...(memo === undefined ? {} : { memo }),
    ...(source === undefined ? {} : { source }),
    months: monthKeysBetween(data.startDate, data.endDate),
  }
}

export async function createAdCampaign(
  data: AdCampaignInput,
  userId: string
): Promise<string> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  const ref = await addDoc(collection(db, CAMPAIGNS), {
    ...withDerivedFields(data),
    createdBy: userId,
    updatedBy: userId,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return ref.id
}

export async function createAdCampaigns(
  items: AdCampaignInput[],
  userId: string
): Promise<number> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  const batch = writeBatch(db)
  items.forEach((item) => {
    batch.set(doc(collection(db, CAMPAIGNS)), {
      ...withDerivedFields(item),
      createdBy: userId,
      updatedBy: userId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
  })
  await batch.commit()
  return items.length
}

export async function updateAdCampaign(
  id: string,
  data: AdCampaignInput,
  userId: string
): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  await updateDoc(doc(db, CAMPAIGNS, id), {
    ...withDerivedFields(data),
    updatedBy: userId,
    updatedAt: Timestamp.now(),
  })
}

export async function deleteAdCampaign(id: string): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  await deleteDoc(doc(db, CAMPAIGNS, id))
}
