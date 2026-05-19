import { NextRequest, NextResponse } from 'next/server'
import { listDriveFiles, extractDriveFileText } from '@/lib/services/drive'
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

    const openai = getOpenAIClient()

    // Drive 파일 목록 가져오기
    const files = await listDriveFiles(folderId)

    let synced = 0
    let skipped = 0
    const errors: string[] = []

    for (const file of files) {
      try {
        // 기존 문서 확인
        const existingQ = query(
          collection(db, 'docs'),
          where('driveFileId', '==', file.id)
        )
        const existingSnap = await getDocs(existingQ)

        // 변경 여부 확인
        if (!existingSnap.empty) {
          const existingDoc = existingSnap.docs[0]
          const existingModified = existingDoc.data().driveModifiedTime
          if (existingModified === file.modifiedTime) {
            skipped++
            continue
          }
        }

        // 텍스트 추출
        const text = await extractDriveFileText(file.id, file.mimeType, file.name)
        if (!text || text.trim().length === 0) {
          skipped++
          continue
        }

        // Firestore docs 컬렉션에 upsert
        const docData = {
          title: file.name,
          content: text.slice(0, 100000), // 저장 크기 제한
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

          // 기존 청크 삭제
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

        // 청크 분할 및 임베딩 생성
        const chunks = chunkText(text)
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
              console.error(`청크 임베딩 실패 [${file.name}] chunk ${i}:`, embErr)
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
        console.error(`파일 동기화 오류 [${file.name}]:`, fileErr)
        errors.push(`${file.name}: ${fileErr instanceof Error ? fileErr.message : '알 수 없는 오류'}`)
      }
    }

    // 마지막 동기화 시간 저장
    await setDoc(doc(db, 'settings', 'driveSync'), {
      lastSyncAt: Timestamp.now(),
      synced,
      skipped,
      errorCount: errors.length,
    })

    return NextResponse.json({ synced, skipped, errors })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Drive 동기화 오류:', error)
    return NextResponse.json(
      { error: `동기화 오류: ${message}` },
      { status: 500 }
    )
  }
}
