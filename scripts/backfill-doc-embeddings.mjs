/**
 * backfill-doc-embeddings.mjs
 *
 * docs 컬렉션에서 docEmbedding 필드가 없는 문서를 찾아 임베딩을 생성·저장.
 * drive-sync.mjs 이후 추가된 2단계 검색을 기존 문서에도 적용하기 위한 1회성 마이그레이션.
 *
 * 실행: node scripts/backfill-doc-embeddings.mjs
 * 옵션: FORCE_ALL=true → 이미 docEmbedding이 있는 문서도 재생성
 */

import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
  terminate,
} from 'firebase/firestore'
import OpenAI from 'openai'

const required = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'OPENAI_API_KEY',
]
const missing = required.filter((k) => !process.env[k])
if (missing.length > 0) {
  console.error('❌ 환경변수 누락:', missing.join(', '))
  process.exit(1)
}

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
})
const db = getFirestore(app)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const FORCE_ALL = process.env.FORCE_ALL === 'true'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log(`🚀 Doc 임베딩 백필 시작 ${FORCE_ALL ? '(전체 강제 재생성)' : '(미완료 문서만)'}`)

  const snap = await getDocs(collection(db, 'docs'))
  const docs = snap.docs

  console.log(`  대상 문서: ${docs.length}개`)

  let updated = 0
  let skipped = 0
  const errors = []

  for (let i = 0; i < docs.length; i++) {
    const d = docs[i]
    const data = d.data()

    // 이미 docEmbedding이 있고 강제 재생성이 아니면 스킵
    if (!FORCE_ALL && data.docEmbedding && data.docEmbedding.length > 0) {
      skipped++
      if (i % 50 === 0) console.log(`  [${i + 1}/${docs.length}] ⏩ 스킵 중...`)
      continue
    }

    const title = data.title ?? '(제목 없음)'
    const content = data.content ?? ''

    if (!content.trim()) {
      console.log(`  [${i + 1}/${docs.length}] ⚠️  내용 없음 스킵: ${title}`)
      skipped++
      continue
    }

    try {
      const embInput = `[문서: ${title}]\n${content.slice(0, 3000)}`
      const res = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: embInput,
      })
      const embedding = res.data[0].embedding

      await updateDoc(doc(db, 'docs', d.id), { docEmbedding: embedding })
      updated++
      console.log(`  [${i + 1}/${docs.length}] ✅ ${title.slice(0, 50)}`)

      // OpenAI 레이트 리밋 방지
      await sleep(100)
    } catch (err) {
      console.error(`  [${i + 1}/${docs.length}] ❌ ${title}: ${err.message}`)
      errors.push(`${title}: ${err.message}`)
    }
  }

  console.log('\n✅ 백필 완료')
  console.log(`  업데이트: ${updated}개 / 스킵: ${skipped}개 / 오류: ${errors.length}개`)
  if (errors.length > 0) {
    console.log('  오류 목록:')
    errors.forEach((e) => console.log('   -', e))
  }

  await terminate(db)
}

main().catch((err) => {
  console.error('❌ 백필 실패:', err)
  process.exit(1)
})
