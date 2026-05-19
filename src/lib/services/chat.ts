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
  where,
} from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { Conversation, Message } from '@/types'

function convertTimestamp(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate()
  if (ts instanceof Date) return ts
  return new Date()
}

export async function getConversations(userId: string): Promise<Conversation[]> {
  const db = getFirestoreInstance()
  if (!db) return []

  try {
    const q = query(
      collection(db, 'conversations'),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc')
    )
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: convertTimestamp(d.data().createdAt),
      updatedAt: convertTimestamp(d.data().updatedAt),
    })) as Conversation[]
  } catch (error) {
    console.error('대화 목록 조회 오류:', error)
    return []
  }
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const db = getFirestoreInstance()
  if (!db) return null

  try {
    const docSnap = await getDoc(doc(db, 'conversations', id))
    if (!docSnap.exists()) return null
    return {
      id: docSnap.id,
      ...docSnap.data(),
      createdAt: convertTimestamp(docSnap.data().createdAt),
      updatedAt: convertTimestamp(docSnap.data().updatedAt),
    } as Conversation
  } catch (error) {
    console.error('대화 조회 오류:', error)
    return null
  }
}

export async function createConversation(userId: string, title: string): Promise<string> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  const docRef = await addDoc(collection(db, 'conversations'), {
    userId,
    title,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return docRef.id
}

export async function updateConversation(id: string, data: Partial<Conversation>): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, createdAt: _createdAt, ...updateData } = data
  await updateDoc(doc(db, 'conversations', id), {
    ...updateData,
    updatedAt: Timestamp.now(),
  })
}

export async function deleteConversation(id: string): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  await deleteDoc(doc(db, 'conversations', id))
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const db = getFirestoreInstance()
  if (!db) return []

  try {
    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'asc')
    )
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: convertTimestamp(d.data().createdAt),
    })) as Message[]
  } catch (error) {
    console.error('메시지 조회 오류:', error)
    return []
  }
}

export async function addMessage(
  conversationId: string,
  message: Omit<Message, 'id' | 'createdAt'>
): Promise<string> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')

  const docRef = await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
    ...message,
    createdAt: Timestamp.now(),
  })

  // 대화 updatedAt 업데이트
  await updateDoc(doc(db, 'conversations', conversationId), {
    updatedAt: Timestamp.now(),
  })

  return docRef.id
}
