import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { CampaignStage, CampaignTask, CampaignTaskStatus } from '@/types'

const DEFAULT_TASKS: { stage: CampaignStage; title: string }[] = [
  { stage: 'discovery', title: '후보 인플루언서 풀 구성' },
  { stage: 'contacting', title: '컨택 가능 여부 확인' },
  { stage: 'contracting', title: '조건/단가 확정 및 계약' },
  { stage: 'draft_review', title: '콘텐츠 초안 수집' },
  { stage: 'approval', title: '브랜드 승인 및 수정 반영' },
  { stage: 'publishing', title: '게시 일정 확인' },
  { stage: 'performance', title: '성과 데이터 수집' },
  { stage: 'reporting', title: '리포트 인사이트 작성' },
]

function toDate(v: unknown): Date {
  return v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : new Date()
}

function docToTask(d: { id: string; data: () => Record<string, unknown> }): CampaignTask {
  const data = d.data()
  return {
    id: d.id,
    campaignId: String(data.campaignId ?? ''),
    stage: (data.stage as CampaignStage) ?? 'discovery',
    title: String(data.title ?? ''),
    description: data.description as string | undefined,
    assigneeId: data.assigneeId as string | undefined,
    dueDate: data.dueDate as string | undefined,
    status: (data.status as CampaignTaskStatus) ?? 'todo',
    relatedInfluencerId: data.relatedInfluencerId as string | undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    createdBy: String(data.createdBy ?? ''),
  }
}

export async function getCampaignTasks(campaignId: string): Promise<CampaignTask[]> {
  const db = getFirestoreInstance()
  if (!db) return []
  const q = query(collection(db, 'campaignTasks'), where('campaignId', '==', campaignId))
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => docToTask(d as Parameters<typeof docToTask>[0]))
    .sort((a, b) => a.stage.localeCompare(b.stage) || b.updatedAt.getTime() - a.updatedAt.getTime())
}

export async function createCampaignTask(
  data: Omit<CampaignTask, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')
  const ref = await addDoc(collection(db, 'campaignTasks'), {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return ref.id
}

export async function updateCampaignTask(id: string, data: Partial<CampaignTask>): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')
  const rest = { ...data } as Partial<CampaignTask>
  delete rest.id
  delete rest.createdAt
  await updateDoc(doc(db, 'campaignTasks', id), {
    ...rest,
    updatedAt: Timestamp.now(),
  })
}

export async function deleteCampaignTask(id: string): Promise<void> {
  const db = getFirestoreInstance()
  if (!db) throw new Error('Firestore가 초기화되지 않았습니다.')
  await deleteDoc(doc(db, 'campaignTasks', id))
}

export async function ensureDefaultWorkflowTasks(
  campaignId: string,
  createdBy: string
): Promise<CampaignTask[]> {
  const existing = await getCampaignTasks(campaignId)
  if (existing.length > 0) return existing

  await Promise.all(
    DEFAULT_TASKS.map((task) =>
      createCampaignTask({
        campaignId,
        stage: task.stage,
        title: task.title,
        status: 'todo',
        createdBy,
      })
    )
  )

  return getCampaignTasks(campaignId)
}
