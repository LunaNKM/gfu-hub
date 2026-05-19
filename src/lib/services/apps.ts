import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  orderBy,
  query,
} from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { App } from '@/types'

function convertTimestamp(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate()
  if (ts instanceof Date) return ts
  return new Date()
}

export async function getApps(): Promise<App[]> {
  const db = getFirestoreInstance()
  if (!db) return []

  try {
    const q = query(collection(db, 'apps'), orderBy('name', 'asc'))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: convertTimestamp(d.data().createdAt),
      updatedAt: convertTimestamp(d.data().updatedAt),
    })) as App[]
  } catch (error) {
    console.error('앱 목록 조회 오류:', error)
    return []
  }
}

export async function createApp(data: Omit<App, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  const docRef = await addDoc(collection(db, 'apps'), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return docRef.id
}

export async function updateApp(id: string, data: Partial<App>): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, createdAt: _createdAt, ...updateData } = data
  await updateDoc(doc(db, 'apps', id), {
    ...updateData,
    updatedAt: Timestamp.now(),
  })
}

export async function deleteApp(id: string): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  await deleteDoc(doc(db, 'apps', id))
}
