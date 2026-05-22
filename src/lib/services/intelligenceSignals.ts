import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  doc,
} from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { BrandImpact, CompetitorWatch, TrendSignal, WeeklyMarketReport } from '@/types'

function toDate(v: unknown): Date {
  return v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : new Date()
}

export async function getTrendSignals(count = 50): Promise<TrendSignal[]> {
  const db = getFirestoreInstance()
  if (!db) return []
  const q = query(collection(db, 'trendSignals'), orderBy('createdAt', 'desc'), limit(count))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, ...data, createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt) } as TrendSignal
  })
}

export async function saveTrendSignal(
  data: Omit<TrendSignal, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore 초기화 실패')
  const ref = await addDoc(collection(db, 'trendSignals'), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return ref.id
}

export async function getBrandImpacts(brandName?: string): Promise<BrandImpact[]> {
  const db = getFirestoreInstance()
  if (!db) return []
  const base = collection(db, 'brandImpacts')
  const q = brandName
    ? query(base, where('brandName', '==', brandName))
    : query(base, orderBy('createdAt', 'desc'), limit(50))
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data(), createdAt: toDate(d.data().createdAt) } as BrandImpact))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export async function saveBrandImpact(data: Omit<BrandImpact, 'id' | 'createdAt'>): Promise<string> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore 초기화 실패')
  const ref = await addDoc(collection(db, 'brandImpacts'), {
    ...data,
    createdAt: Timestamp.now(),
  })
  return ref.id
}

export async function getCompetitorWatches(): Promise<CompetitorWatch[]> {
  const db = getFirestoreInstance()
  if (!db) return []
  const q = query(collection(db, 'competitorWatches'), orderBy('updatedAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      ...data,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
      lastCheckedAt: data.lastCheckedAt ? toDate(data.lastCheckedAt) : undefined,
    } as CompetitorWatch
  })
}

export async function createCompetitorWatch(
  data: Omit<CompetitorWatch, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore 초기화 실패')
  const ref = await addDoc(collection(db, 'competitorWatches'), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateCompetitorWatch(id: string, data: Partial<CompetitorWatch>): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore 초기화 실패')
  const rest = { ...data } as Partial<CompetitorWatch>
  delete rest.id
  delete rest.createdAt
  await updateDoc(doc(db, 'competitorWatches', id), {
    ...rest,
    updatedAt: Timestamp.now(),
  })
}

export async function getWeeklyMarketReports(count = 12): Promise<WeeklyMarketReport[]> {
  const db = getFirestoreInstance()
  if (!db) return []
  const q = query(collection(db, 'weeklyMarketReports'), orderBy('createdAt', 'desc'), limit(count))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toDate(d.data().createdAt) } as WeeklyMarketReport))
}

export async function saveWeeklyMarketReport(
  data: Omit<WeeklyMarketReport, 'id' | 'createdAt'>
): Promise<string> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore 초기화 실패')
  const ref = await addDoc(collection(db, 'weeklyMarketReports'), {
    ...data,
    createdAt: Timestamp.now(),
  })
  return ref.id
}
