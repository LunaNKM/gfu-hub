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

function chunkText(text, size = 2000, overlap = 200) {
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
            const text = rows.map((row) => row.join('\t')).join('\n')
            parts.push(`=== 시트: ${sheetTitle} ===\n${text}`)
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
  console.log('🚀 Drive 동기화 시작')
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
    console.log(`[${i + 1}/${supported.length}] ${file.name}`)

    try {
      // 변경 여부 확인
      const existingQ = query(collection(db, 'docs'), where('driveFileId', '==', file.id))
      const existingSnap = await getDocs(existingQ)

      if (!existingSnap.empty) {
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
      const docData = {
        title: file.name,
        content: text.slice(0, 100000),
        category: 'Google Drive',
        tags: ['drive'],
        isActive: true,
        source: 'drive',
        driveFileId: file.id,
        driveModifiedTime: file.modifiedTime,
        updatedAt: Timestamp.now(),
      }

      let docId
      if (!existingSnap.empty) {
        docId = existingSnap.docs[0].id
        await updateDoc(doc(db, 'docs', docId), docData)

        // 기존 청크 삭제
        const chunksSnap = await getDocs(query(collection(db, 'docChunks'), where('docId', '==', docId)))
        for (const c of chunksSnap.docs) {
          await deleteDoc(doc(db, 'docChunks', c.id))
        }
      } else {
        const ref = await addDoc(collection(db, 'docs'), {
          ...docData,
          createdAt: Timestamp.now(),
          createdBy: 'drive-sync',
          updatedBy: 'drive-sync',
        })
        docId = ref.id
      }

      // 청크 + 임베딩 생성 (한도 없음 — 파일 전체를 청크로 저장)
      const chunks = chunkText(text)
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
        await addDoc(collection(db, 'docChunks'), {
          docId,
          title: file.name,
          chunkIndex: ci,
          content: chunks[ci],
          category: 'Google Drive',
          tags: ['drive'],
          updatedAt: Timestamp.now(),
          ...(embedding ? { embedding } : {}),
        })
      }

      console.log(`  ✅ 완료 (청크 ${chunks.length}개)`)
      synced++
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
