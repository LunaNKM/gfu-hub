import { NextRequest, NextResponse } from 'next/server'
import { listDriveFiles, extractDriveFileText, DriveFile } from '@/lib/services/drive'
import { chunkText } from '@/lib/utils/chunking'
import { getOpenAIClient } from '@/lib/openai/client'
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  Timestamp,
  addDoc,
} from 'firebase/firestore'
import { getFirestoreInstance } from '@/lib/firebase/firestore'

export const maxDuration = 60

const BATCH_SIZE = 3
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
    const action: string = body.action ?? 'process'
    const cursor: number = typeof body.cursor === 'number' ? body.cursor : 0

    // ── 1단계: 파일 목록 수집 후 Firestore에 캐싱 ──────────────
    if (action === 'list') {
      const files = await listDriveFiles(folderId)
      const filesMeta = files.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        size: f.size ?? null,
      }))

      await setDoc(doc(db, 'settings', 'driveSyncQueue'), {
        files: filesMeta,
        totalFiles: filesMeta.length,
        createdAt: Timestamp.now(),
      })

      return NextResponse.json({ phase: 'listed', totalFiles: filesMeta.length })
    }

    // ── 2단계: 캐싱된 목록으로 배치 처리 ──────────────────────
    const queueSnap = await getDoc(doc(db, 'settings', 'driveSyncQueue'))
    if (!queueSnap.exists()) {
      return NextResponse.json({ error: '파일 목록이 없습니다. 다시 시도해주세요.' }, { status: 400 })
    }

    const queueData = queueSnap.data()
    const allFiles: DriveFile[] = queueData.files ?? []
    const totalFiles: number = queueData.totalFiles ?? allFiles.length
    const batch = allFiles.slice(cursor, cursor + BATCH_SIZE)
    const nextCursor = cursor + BATCH_SIZE < totalFiles ? cursor + BATCH_SIZE : null
    const progress = Math.min(100, Math.round(((cursor + batch.length) / totalFiles) * 100))

    const openai = getOpenAIClient()
    let synced = 0
    let skipped = 0
    const errors: string[] = []

    for (const file of batch) {
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
          const chunk = chunks[i]
          let embedding: number[] | undefined

          if (openai) {
            try {
              const embRes = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: chunk.slice(0, 8000),
              })
              embedding = embRes.data[0].embedding
            } catch (embErr) {
              console.error(`임베딩 실패 [${file.name}] chunk ${i}:`, embErr)
            }
          }

          await addDoc(collection(db, 'docChunks'), {
            docId,
            title: file.name,
            chunkIndex: i,
            content: chunk,
            category: 'Google Drive',
            tags: ['drive'],
            updatedAt: Timestamp.now(),
            ...(embedding ? { embedding } : {}),
          })
        }

        synced++
      } catch (fileErr) {
        console.error(`파일 오류 [${file.name}]:`, fileErr)
        errors.push(`${file.name}: ${fileErr instanceof Error ? fileErr.message : '알 수 없는 오류'}`)
      }
    }

    // 마지막 배치: 설정 저장 + 큐 삭제
    if (nextCursor === null) {
      await setDoc(doc(db, 'settings', 'driveSync'), {
        lastSyncAt: Timestamp.now(),
        synced,
        skipped,
        errorCount: errors.length,
      })
    }

    return NextResponse.json({ synced, skipped, errors, totalFiles, cursor, nextCursor, progress })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Drive 동기화 오류:', error)
    return NextResponse.json({ error: `동기화 오류: ${message}` }, { status: 500 })
  }
}
