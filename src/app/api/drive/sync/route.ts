import { NextRequest, NextResponse } from 'next/server'
import { listDriveFilesPage, extractDriveFileText } from '@/lib/services/drive'
import { chunkText } from '@/lib/utils/chunking'
import { getOpenAIClient } from '@/lib/openai/client'
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  updateDoc,
  Timestamp,
  addDoc,
} from 'firebase/firestore'
import { getFirestoreInstance } from '@/lib/firebase/firestore'

export const maxDuration = 60

// 한 요청당 처리할 파일 수 (Drive 리스트 + 텍스트 추출 + 임베딩 포함)
const PAGE_SIZE = 5
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
    if (!folderId) {
      return NextResponse.json(
        { error: 'GOOGLE_DRIVE_FOLDER_ID 환경변수가 설정되지 않았습니다.' },
        { status: 503 }
      )
    }

    const db = getFirestoreInstance()
    if (!db) {
      return NextResponse.json({ error: 'Firestore가 초기화되지 않았습니다.' }, { status: 503 })
    }

    const body = await req.json().catch(() => ({}))
    // pageToken: Drive API pageToken (null이면 처음부터)
    const pageToken: string | undefined = body.pageToken ?? undefined

    // Drive에서 PAGE_SIZE개 파일 가져오기 (재귀 없이 ancestors 쿼리)
    const { files, nextPageToken } = await listDriveFilesPage(folderId, PAGE_SIZE, pageToken)

    const openai = getOpenAIClient()
    let synced = 0
    let skipped = 0
    const errors: string[] = []

    for (const file of files) {
      try {
        if (file.size && parseInt(file.size) > MAX_FILE_SIZE_BYTES) {
          skipped++
          continue
        }

        const existingQ = query(collection(db, 'docs'), where('driveFileId', '==', file.id))
        const existingSnap = await getDocs(existingQ)

        if (!existingSnap.empty) {
          const existingModified = existingSnap.docs[0].data().driveModifiedTime
          if (existingModified === file.modifiedTime) {
            skipped++
            continue
          }
        }

        const text = await extractDriveFileText(file.id, file.mimeType, file.name)
        if (!text || text.trim().length === 0) {
          skipped++
          continue
        }

        const docData = {
          title: file.name,
          content: text.slice(0, 50000),
          category: 'Google Drive',
          tags: ['drive'],
          isActive: true,
          source: 'drive',
          driveFileId: file.id,
          driveModifiedTime: file.modifiedTime,
          updatedAt: Timestamp.now(),
        }

        let docId: string
        if (!existingSnap.empty) {
          docId = existingSnap.docs[0].id
          await updateDoc(doc(db, 'docs', docId), docData)

          const chunksQ = query(collection(db, 'docChunks'), where('docId', '==', docId))
          const chunksSnap = await getDocs(chunksQ)
          for (const chunkDoc of chunksSnap.docs) {
            const { deleteDoc } = await import('firebase/firestore')
            await deleteDoc(doc(db, 'docChunks', chunkDoc.id))
          }
        } else {
          const newDocRef = await addDoc(collection(db, 'docs'), {
            ...docData,
            createdAt: Timestamp.now(),
            createdBy: 'drive-sync',
            updatedBy: 'drive-sync',
          })
          docId = newDocRef.id
        }

        const chunks = chunkText(text).slice(0, 10)
        for (let i = 0; i < chunks.length; i++) {
          let embedding: number[] | undefined
          if (openai) {
            try {
              const embRes = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: chunks[i].slice(0, 8000),
              })
              embedding = embRes.data[0].embedding
            } catch {
              // 임베딩 실패해도 계속 진행
            }
          }

          await addDoc(collection(db, 'docChunks'), {
            docId,
            title: file.name,
            chunkIndex: i,
            content: chunks[i],
            category: 'Google Drive',
            tags: ['drive'],
            updatedAt: Timestamp.now(),
            ...(embedding ? { embedding } : {}),
          })
        }

        synced++
      } catch (fileErr) {
        errors.push(`${file.name}: ${fileErr instanceof Error ? fileErr.message : '알 수 없는 오류'}`)
      }
    }

    // 마지막 페이지: 동기화 완료 시간 저장
    if (!nextPageToken) {
      await setDoc(doc(db, 'settings', 'driveSync'), {
        lastSyncAt: Timestamp.now(),
        synced,
        skipped,
        errorCount: errors.length,
      })
    }

    return NextResponse.json({
      synced,
      skipped,
      errors,
      nextPageToken,
      done: !nextPageToken,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Drive 동기화 오류:', error)
    return NextResponse.json({ error: `동기화 오류: ${message}` }, { status: 500 })
  }
}
