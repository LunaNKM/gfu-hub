import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  orderBy,
  query,
} from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { Campaign, CampaignStatus } from '@/types'

function convertTimestamp(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate()
  if (ts instanceof Date) return ts
  return new Date()
}

function docToCampaign(d: { id: string; data: () => Record<string, unknown> }): Campaign {
  const data = d.data()
  return {
    id: d.id,
    clientName: (data.clientName as string) ?? '',
    campaignName: (data.campaignName as string) ?? '',
    status: (data.status as CampaignStatus) ?? 'proposal',
    startDate: (data.startDate as string) ?? '',
    endDate: (data.endDate as string) ?? '',
    budget: (data.budget as number) ?? 0,
    sheetsUrl: data.sheetsUrl as string | undefined,
    sheetsIndex: data.sheetsIndex as Campaign['sheetsIndex'],
    sheets: data.sheets as Campaign['sheets'],
    sheetsLastSyncAt: data.sheetsLastSyncAt
      ? convertTimestamp(data.sheetsLastSyncAt)
      : undefined,
    memo: data.memo as string | undefined,
    createdAt: convertTimestamp(data.createdAt),
    updatedAt: convertTimestamp(data.updatedAt),
    createdBy: (data.createdBy as string) ?? '',
  }
}

export async function getCampaigns(): Promise<Campaign[]> {
  const db = getFirestoreInstance()
  if (!db) return []
  try {
    const q = query(collection(db, 'campaigns'), orderBy('updatedAt', 'desc'))
    const snap = await getDocs(q)
    return snap.docs.map((d) => docToCampaign(d as Parameters<typeof docToCampaign>[0]))
  } catch (error) {
    console.error('캠페인 목록 조회 오류:', error)
    return []
  }
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const db = getFirestoreInstance()
  if (!db) return null
  try {
    const snap = await getDoc(doc(db, 'campaigns', id))
    if (!snap.exists()) return null
    return docToCampaign(snap as Parameters<typeof docToCampaign>[0])
  } catch (error) {
    console.error('캠페인 조회 오류:', error)
    return null
  }
}

export async function createCampaign(
  data: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')
  const ref = await addDoc(collection(db, 'campaigns'), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateCampaign(id: string, data: Partial<Campaign>): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, createdAt: _createdAt, ...rest } = data
  await updateDoc(doc(db, 'campaigns', id), {
    ...rest,
    updatedAt: Timestamp.now(),
  })
}

export async function deleteCampaign(id: string): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')
  await deleteDoc(doc(db, 'campaigns', id))
}
