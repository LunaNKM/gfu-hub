/**
 * Google Drive → Firestore 동기화 스크립트
 * GitHub Actions에서 실행 (메모리 7GB, 시간 제한 없음)
 *
 * 실행: node scripts/drive-sync.mjs
 */

import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
  terminate,
} from 'firebase/firestore'
import { google } from 'googleapis'
import OpenAI from 'openai'

// ── 환경변수 확인 ─────────────────────────────────────────────
const required = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REFRESH_TOKEN',
  'GOOGLE_DRIVE_FOLDER_ID',
]
const missing = required.filter((k) => !process.env[k])
if (missing.length > 0) {
  console.error('❌ 환경변수 누락:', missing.join(', '))
  process.exit(1)
}

// ── Firebase 초기화 ───────────────────────────────────────────
const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
})
const db = getFirestore(app)

// ── Google Drive 클라이언트 ───────────────────────────────────
const oAuth2 = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET
)
oAuth2.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN })
const drive = google.drive({ version: 'v3', auth: oAuth2 })
const sheets = google.sheets({ version: 'v4', auth: oAuth2 })

// ── OpenAI 클라이언트 (선택) ──────────────────────────────────
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

// ── 청크 설정 ─────────────────────────────────────────────────
// MAX_CHUNKS_PER_DOC: 문서당 최대 청크 수. 0 = 제한 없음
// 예: 200청크 × 1000자 = 200,000자(~200KB) 커버
const MAX_CHUNKS_PER_DOC = parseInt(process.env.MAX_CHUNKS_PER_DOC ?? '200', 10)

// ── 유틸 함수들 ───────────────────────────────────────────────
function isSupportedFileType(mimeType, fileName) {
  if (
    mimeType === 'application/vnd.google-apps.document' ||
    mimeType === 'application/vnd.google-apps.spreadsheet' ||
    mimeType === 'application/vnd.google-apps.presentation'
  )
    return true
  const textTypes = ['text/plain', 'text/markdown', 'application/json', 'text/csv', 'text/html']
  const textExts = ['.txt', '.md', '.json', '.csv', '.html', '.htm']
  if (textTypes.includes(mimeType)) return true
  if (textExts.some((e) => fileName.toLowerCase().endsWith(e))) return true
  return false
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function chunkText(text, size = 1000, overlap = 150) {
  const chunks = []
  let start = 0
  while (start < text.length) {
    chunks.push(text.slice(start, start + size))
    start += size - overlap
  }
  return chunks
}

// ── 폴더 재귀 파일 수집 ───────────────────────────────────────
async function collectAllFiles(folderId) {
  const files = []
  const folderQueue = [folderId]

  while (folderQueue.length > 0) {
    const currentFolder = folderQueue.shift()
    let pageToken = undefined

    do {
      const res = await drive.files.list({
        q: `'${currentFolder}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,size)',
        pageSize: 100,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        ...(pageToken ? { pageToken } : {}),
      })

      for (const f of res.data.files ?? []) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          folderQueue.push(f.id)
        } else {
          files.push(f)
        }
      }
      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken)
  }

  return files
}

// ── 텍스트 추출 ───────────────────────────────────────────────
async function extractText(fileId, mimeType, fileName) {
  try {
    if (mimeType === 'application/vnd.google-apps.document') {
      const res = await drive.files.export({ fileId, mimeType: 'text/plain' }, { responseType: 'text' })
      return res.data ?? null
    }
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      // Sheets API로 모든 탭을 읽는다 (Drive export는 첫 탭만 반환)
      try {
        const meta = await sheets.spreadsheets.get({
          spreadsheetId: fileId,
          fields: 'sheets.properties(title,sheetId)',
        })
        const sheetList = meta.data.sheets ?? []
        const parts = []

        for (const sheet of sheetList) {
          const sheetTitle = sheet.properties.title
          try {
            const valRes = await sheets.spreadsheets.values.get({
              spreadsheetId: fileId,
              range: sheetTitle,
              valueRenderOption: 'FORMATTED_VALUE',
            })
            const rows = valRes.data.values ?? []
            if (rows.length === 0) continue

            // 빈 행 제거 + 셀을 ' | '로 연결해 AI가 읽기 쉬운 텍스트로 변환
            const lines = []
            for (const row of rows) {
              const cells = row.map((c) => (c ?? '').toString().trim())
              const meaningful = cells.filter((c) => c.length > 0)
              if (meaningful.length === 0) continue   // 빈 행 스킵
              lines.push(meaningful.join(' | '))
            }

            if (lines.length === 0) continue
            parts.push(`=== 시트: ${sheetTitle} ===\n${lines.join('\n')}`)
          } catch (sheetErr) {
            console.warn(`    탭 읽기 실패 [${sheetTitle}]:`, sheetErr.message)
          }
        }

        if (parts.length > 0) return parts.join('\n\n')
      } catch (sheetsErr) {
        console.warn(`    Sheets API 실패, CSV 폴백:`, sheetsErr.message)
      }
      // Sheets API 실패 시 CSV 폴백 (첫 탭만)
      const res = await drive.files.export({ fileId, mimeType: 'text/csv' }, { responseType: 'text' })
      return res.data ?? null
    }
    if (mimeType === 'application/vnd.google-apps.presentation') {
      const res = await drive.files.export({ fileId, mimeType: 'text/plain' }, { responseType: 'text' })
      return res.data ?? null
    }
    const textTypes = ['text/plain', 'text/markdown', 'application/json', 'text/csv', 'text/html']
    const textExts = ['.txt', '.md', '.json', '.csv', '.html', '.htm']
    const isText = textTypes.includes(mimeType) || textExts.some((e) => fileName.toLowerCase().endsWith(e))
    if (isText) {
      const res = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'text' }
      )
      return res.data ?? null
    }
    return null
  } catch (err) {
    console.error(`  텍스트 추출 실패 [${fileName}]:`, err.message)
    return null
  }
}

// ── 메인 ─────────────────────────────────────────────────────
async function main() {
  const forceResync = process.env.FORCE_RESYNC === 'true'
  // START_FROM_INDEX: 해당 인덱스(0-based) 이전 파일은 Firestore 조회 없이 즉시 건너뜀
  // 예: 388번까지 완료하고 중단됐으면 START_FROM_INDEX=388 로 재실행
  const startFromIndex = parseInt(process.env.START_FROM_INDEX ?? '0', 10)
  const logPrefix = startFromIndex > 0 ? ` | ⏩ ${startFromIndex}번 인덱스부터 재개` : ''
  console.log(`🚀 Drive 동기화 시작 ${forceResync ? '(강제 전체 재동기화)' : ''}${logPrefix}`)
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

  // 1. 파일 목록 수집
  console.log('📂 파일 목록 수집 중...')
  const allFiles = await collectAllFiles(folderId)
  console.log(`  총 ${allFiles.length}개 파일 발견`)

  const supported = allFiles.filter((f) => isSupportedFileType(f.mimeType, f.name))
  const skippedType = allFiles.length - supported.length
  console.log(`  처리 대상: ${supported.length}개 / 타입 미지원 건너뜀: ${skippedType}개`)

  let synced = 0
  let skipped = 0
  const errors = []

  // 2. 파일별 처리
  for (let i = 0; i < supported.length; i++) {
    const file = supported[i]

    // START_FROM_INDEX: 이전 파일은 API 호출 없이 즉시 건너뜀 (재개 모드)
    if (i < startFromIndex) {
      if (i === 0 || i === startFromIndex - 1) {
        console.log(`⏩ [1~${startFromIndex}/${supported.length}] 이전 완료분 건너뜀...`)
      }
      skipped++
      continue
    }

    console.log(`[${i + 1}/${supported.length}] ${file.name}`)

    try {
      // 변경 여부 확인 (강제 재동기화 시 스킵)
      const existingQ = query(collection(db, 'docs'), where('driveFileId', '==', file.id))
      const existingSnap = await getDocs(existingQ)

      if (!forceResync && !existingSnap.empty) {
        const existingModified = existingSnap.docs[0].data().driveModifiedTime
        if (existingModified === file.modifiedTime) {
          console.log('  → 변경 없음, 건너뜀')
          skipped++
          continue
        }
      }

      // 텍스트 추출
      const text = await extractText(file.id, file.mimeType, file.name)
      if (!text || text.trim().length === 0) {
        console.log('  → 텍스트 없음, 건너뜀')
        skipped++
        continue
      }

      // Firestore upsert
      // content는 UI 프리뷰용 3,000자만 저장. 전체 내용은 docChunks에서 관리
      // (50,000자 저장 시 Korean UTF-8 기준 ~150KB → gRPC Write 스트림 한도 초과 원인)
      const docData = {
        title: file.name,
        content: text.slice(0, 3000),
        category: 'Google Drive',
        tags: ['drive'],
        isActive: true,
        source: 'drive',
        driveFileId: file.id,
        driveModifiedTime: file.modifiedTime,
        updatedAt: Timestamp.now(),
      }

      // 청크 + 임베딩 생성
      // MAX_CHUNKS_PER_DOC(기본 200) × 1000자 = 최대 200,000자 커버
      // ※ 먼저 청크를 만들어야 chunkCount를 docData에 함께 저장할 수 있음
      const rawChunks = chunkText(text)
      const chunks = MAX_CHUNKS_PER_DOC > 0 ? rawChunks.slice(0, MAX_CHUNKS_PER_DOC) : rawChunks
      const chunkCount = chunks.length

      let docId
      if (!existingSnap.empty) {
        docId = existingSnap.docs[0].id
        const oldChunkCount = existingSnap.docs[0].data().chunkCount ?? 0

        // ── 기존 청크 삭제 ────────────────────────────────────────
        // 청크 ID가 예측 가능한 형식({docId}_{index})이면 쿼리(읽기) 없이 바로 삭제.
        // chunkCount 필드가 없는 구버전 문서는 쿼리 폴백(1회만 발생).
        if (oldChunkCount > 0) {
          // 신규 방식: 예측 가능한 ID로 삭제 → 읽기 0건
          for (let bi = 0; bi < oldChunkCount; bi += 400) {
            const batch = writeBatch(db)
            for (let ci = bi; ci < Math.min(bi + 400, oldChunkCount); ci++) {
              batch.delete(doc(db, 'docChunks', `${docId}_${ci}`))
            }
            await batch.commit()
            if (bi + 400 < oldChunkCount) await sleep(200)
          }
        } else {
          // 구버전 폴백: 한 번만 쿼리 후 삭제 (마이그레이션 완료 후 사라짐)
          const chunksSnap = await getDocs(query(collection(db, 'docChunks'), where('docId', '==', docId)))
          if (!chunksSnap.empty) {
            for (let bi = 0; bi < chunksSnap.docs.length; bi += 400) {
              const batch = writeBatch(db)
              chunksSnap.docs.slice(bi, bi + 400).forEach((c) => batch.delete(doc(db, 'docChunks', c.id)))
              await batch.commit()
              if (bi + 400 < chunksSnap.docs.length) await sleep(200)
            }
          }
        }

        await updateDoc(doc(db, 'docs', docId), { ...docData, chunkCount })
      } else {
        const ref = await addDoc(collection(db, 'docs'), {
          ...docData,
          chunkCount,
          createdAt: Timestamp.now(),
          createdBy: 'drive-sync',
          updatedBy: 'drive-sync',
        })
        docId = ref.id
      }

      // ── 청크 쓰기 (예측 가능한 ID: {docId}_{index}) ──────────
      for (let ci = 0; ci < chunks.length; ci++) {
        let embedding = undefined
        if (openai) {
          try {
            const embRes = await openai.embeddings.create({
              model: 'text-embedding-3-small',
              input: chunks[ci].slice(0, 8000),
            })
            embedding = embRes.data[0].embedding
          } catch {
            // 임베딩 실패 무시
          }
        }

        const chunkData = {
          docId,
          title: file.name,
          chunkIndex: ci,
          content: chunks[ci],
          category: 'Google Drive',
          tags: ['drive'],
          updatedAt: Timestamp.now(),
          ...(embedding ? { embedding } : {}),
        }

        // setDoc으로 upsert (ID가 고정이므로 중복 없음)
        await setDoc(doc(db, 'docChunks', `${docId}_${ci}`), chunkData)

        // Firestore Write 스트림 + OpenAI 레이트 리밋 방지
        await sleep(150)
      }

      console.log(`  ✅ 완료 (청크 ${chunkCount}개)`)
      synced++
      // 파일 간 딜레이 — Firestore 쓰기 스트림 과부하 방지
      await sleep(200)
    } catch (err) {
      console.error(`  ❌ 오류:`, err.message)
      errors.push(`${file.name}: ${err.message}`)
    }
  }

  // 3. 동기화 시간 저장
  await setDoc(doc(db, 'settings', 'driveSync'), {
    lastSyncAt: Timestamp.now(),
    synced,
    skipped,
    errorCount: errors.length,
  })

  console.log('\n✅ 동기화 완료')
  console.log(`  동기화: ${synced}개 / 건너뜀: ${skipped}개 / 오류: ${errors.length}개`)
  if (errors.length > 0) {
    console.log('  오류 목록:')
    errors.forEach((e) => console.log('   -', e))
  }

  await terminate(db)
}

main().catch((err) => {
  console.error('❌ 동기화 실패:', err)
  process.exit(1)
})
