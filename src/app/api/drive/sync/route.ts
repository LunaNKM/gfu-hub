import { NextRequest, NextResponse } from 'next/server'
import { listFolderPage, extractDriveFileText, isSupportedFileType } from '@/lib/services/drive'
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

const PAGE_SIZE = 1
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID
    if (!rootFolderId) {
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

    // 첫 요청: folderQueue = [rootFolderId], currentFolder = rootFolderId
    // 이후: 클라이언트에서 받은 상태 그대로 사용
    const currentFolder: string = body.currentFolder ?? rootFolderId
    const pageToken: string | undefined = body.pageToken ?? undefined
    const folderQueue: string[] = Array.isArray(body.folderQueue) ? body.folderQueue : []

    // 현재 폴더에서 파일 + 하위 폴더 가져오기
    const { files, subfolderIds, nextPageToken } = await listFolderPage(
      currentFolder,
      PAGE_SIZE,
      pageToken
    )

    // 새로 발견된 하위 폴더를 큐에 추가
    const updatedQueue = [...folderQueue, ...subfolderIds]

    const openai = getOpenAIClient()
    let synced = 0
    let skipped = 0
    const errors: string[] = []

    for (const file of files) {
      try {
        // 지원하지 않는 파일 타입 건너뜀 (PDF, DOCX 등 메모리 과다 사용)
        if (!isSupportedFileType(file.mimeType, file.name)) {
          skipped++
          continue
        }

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
          content: text.slice(0, 20000),
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

        const chunks = chunkText(text.slice(0, 20000)).slice(0, 5)
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
              // 임베딩 실패해도 계속
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

    // 다음 요청 파라미터 계산
    let nextCurrentFolder: string | null = null
    let nextQueue: string[] = updatedQueue

    if (nextPageToken) {
      // 현재 폴더에 더 파일이 있음
      nextCurrentFolder = currentFolder
    } else if (updatedQueue.length > 0) {
      // 다음 폴더로 이동
      nextCurrentFolder = updatedQueue[0]
      nextQueue = updatedQueue.slice(1)
    }

    const done = nextCurrentFolder === null

    if (done) {
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
      done,
      // 다음 요청용 상태
      nextCurrentFolder,
      nextPageToken: nextPageToken ?? null,
      nextFolderQueue: nextQueue,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Drive 동기화 오류:', error)
    return NextResponse.json({ error: `동기화 오류: ${message}` }, { status: 500 })
  }
}
