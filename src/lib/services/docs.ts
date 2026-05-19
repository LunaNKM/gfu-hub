import {
  collection,
  getDocs as firestoreGetDocs,
  getDoc as firestoreGetDoc,
  addDoc,
  updateDoc as firestoreUpdateDoc,
  deleteDoc as firestoreDeleteDoc,
  doc,
  Timestamp,
  orderBy,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { Doc, DocChunk } from '@/types'
import { chunkText } from '../utils/chunking'

function convertTimestamp(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate()
  if (ts instanceof Date) return ts
  return new Date()
}

export async function getDocs(): Promise<Doc[]> {
  const db = getFirestoreInstance()
  if (!db) return []

  try {
    const q = query(collection(db, 'docs'), where('isActive', '==', true), orderBy('updatedAt', 'desc'))
    const snapshot = await firestoreGetDocs(q)
    return snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: convertTimestamp(d.data().createdAt),
      updatedAt: convertTimestamp(d.data().updatedAt),
    })) as Doc[]
  } catch (error) {
    console.error('문서 목록 조회 오류:', error)
    return []
  }
}

export async function getDoc(id: string): Promise<Doc | null> {
  const db = getFirestoreInstance()
  if (!db) return null

  try {
    const docSnap = await firestoreGetDoc(doc(db, 'docs', id))
    if (!docSnap.exists()) return null
    return {
      id: docSnap.id,
      ...docSnap.data(),
      createdAt: convertTimestamp(docSnap.data().createdAt),
      updatedAt: convertTimestamp(docSnap.data().updatedAt),
    } as Doc
  } catch (error) {
    console.error('문서 조회 오류:', error)
    return null
  }
}

export async function createDoc(data: Omit<Doc, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  const docRef = await addDoc(collection(db, 'docs'), {
    ...data,
    isActive: data.isActive ?? true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return docRef.id
}

export async function updateDoc(id: string, data: Partial<Doc>): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, createdAt: _createdAt, ...updateData } = data
  await firestoreUpdateDoc(doc(db, 'docs', id), {
    ...updateData,
    updatedAt: Timestamp.now(),
  })
}

export async function deleteDoc(id: string): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  await firestoreDeleteDoc(doc(db, 'docs', id))
  await deleteDocChunks(id)
}

export async function searchDocs(queryStr: string): Promise<Doc[]> {
  const allDocs = await getDocs()
  const lower = queryStr.toLowerCase()
  return allDocs.filter(
    (d) =>
      d.title.toLowerCase().includes(lower) ||
      d.content.toLowerCase().includes(lower) ||
      d.tags.some((tag) => tag.toLowerCase().includes(lower)) ||
      d.category.toLowerCase().includes(lower)
  )
}

export async function createDocChunks(
  docId: string,
  content: string,
  title: string,
  category: string,
  tags: string[]
): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) return

  await deleteDocChunks(docId)

  const chunks = chunkText(content)
  const batch = writeBatch(db)

  chunks.forEach((chunk, index) => {
    const chunkRef = doc(collection(db, 'docChunks'))
    const chunkData: Omit<DocChunk, 'id'> = {
      docId,
      title,
      chunkIndex: index,
      content: chunk,
      category,
      tags,
      updatedAt: new Date(),
    }
    batch.set(chunkRef, {
      ...chunkData,
      updatedAt: Timestamp.now(),
    })
  })

  await batch.commit()
}

export async function deleteDocChunks(docId: string): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) return

  try {
    const q = query(collection(db, 'docChunks'), where('docId', '==', docId))
    const snapshot = await firestoreGetDocs(q)
    const batch = writeBatch(db)
    snapshot.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  } catch (error) {
    console.error('청크 삭제 오류:', error)
  }
}
