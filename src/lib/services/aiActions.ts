import {
  addDoc,
  collection,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
  doc,
} from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { AiActionRun, AiActionType } from '@/types'

function toDate(v: unknown): Date {
  return v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : new Date()
}

function docToRun(d: { id: string; data: () => Record<string, unknown> }): AiActionRun {
  const data = d.data()
  return {
    id: d.id,
    type: data.type as AiActionType,
    campaignId: data.campaignId as string | undefined,
    influencerId: data.influencerId as string | undefined,
    input: (data.input as Record<string, unknown>) ?? {},
    output: (data.output as Record<string, unknown>) ?? {},
    status: (data.status as AiActionRun['status']) ?? 'completed',
    errorMessage: data.errorMessage as string | undefined,
    createdBy: String(data.createdBy ?? ''),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  }
}

export async function createAiActionRun(
  data: Omit<AiActionRun, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')
  const ref = await addDoc(collection(db, 'aiActionRuns'), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateAiActionRun(id: string, patch: Partial<AiActionRun>): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')
  const rest = { ...patch } as Partial<AiActionRun>
  delete rest.id
  delete rest.createdAt
  await updateDoc(doc(db, 'aiActionRuns', id), {
    ...rest,
    updatedAt: Timestamp.now(),
  })
}

export async function getAiActionRuns(campaignId: string): Promise<AiActionRun[]> {
  const db = getFirestoreInstance()
  if (!db) return []
  const q = query(collection(db, 'aiActionRuns'), where('campaignId', '==', campaignId))
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => docToRun(d as Parameters<typeof docToRun>[0]))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}
