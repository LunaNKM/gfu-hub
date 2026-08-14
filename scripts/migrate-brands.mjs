/**
 * 브랜드 관리 데이터를 기존 Firebase 프로젝트에서 gfu-hub 프로젝트로 옮긴다.
 *
 * 옮기는 것:
 *   brands/{brandId}
 *   shareLinks/{token}
 *   shareLinks/{token}/edits/{influencerId}
 *   shareLinks/{token}/settings/{docId}      (실제로는 settings/concepts 하나)
 *
 * 준비물 — 두 프로젝트의 서비스 계정 키(JSON). Firebase 콘솔의
 * 프로젝트 설정 > 서비스 계정 > "새 비공개 키 생성" 에서 받는다.
 *
 *   set SOURCE_SERVICE_ACCOUNT=C:\path\to\source-key.json
 *   set TARGET_SERVICE_ACCOUNT=C:\path\to\gfu-hub-key.json
 *   node scripts/migrate-brands.mjs --dry-run     (먼저 이걸로 건수 확인)
 *   node scripts/migrate-brands.mjs
 *
 * 여러 번 돌려도 같은 문서 ID 로 덮어쓰므로 결과는 같다. 다만 이전이 끝난 뒤
 * 원본에서 계속 작업했다면 그만큼 다시 덮어쓰게 되니, 실제 전환일에는 원본
 * 앱 사용을 멈춘 상태에서 마지막으로 한 번 더 돌리는 편이 안전하다.
 *
 * gcloud 를 쓸 수 있다면 아래 방법도 있다(코드 없이 통째로 옮긴다):
 *   gcloud firestore export gs://BUCKET --collection-ids=brands,shareLinks,edits,settings --project=SOURCE
 *   gcloud firestore import gs://BUCKET/<폴더> --project=gfu-hub
 */
import { readFileSync } from 'node:fs'
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const DRY_RUN = process.argv.includes('--dry-run')

function credentialsFrom(envName) {
  const path = process.env[envName]
  if (!path) {
    console.error(`환경변수 ${envName} 에 서비스 계정 키 파일 경로가 필요합니다.`)
    process.exit(1)
  }
  return cert(JSON.parse(readFileSync(path, 'utf8')))
}

const source = getFirestore(
  initializeApp({ credential: credentialsFrom('SOURCE_SERVICE_ACCOUNT') }, 'source')
)
const target = getFirestore(
  initializeApp({ credential: credentialsFrom('TARGET_SERVICE_ACCOUNT') }, 'target')
)

// Firestore 배치는 한 번에 500개까지라 그보다 작게 끊어 쓴다.
const BATCH_LIMIT = 400

async function copyDocs(docs, describe) {
  let written = 0
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const slice = docs.slice(i, i + BATCH_LIMIT)
    if (!DRY_RUN) {
      const batch = target.batch()
      for (const doc of slice) {
        batch.set(target.doc(doc.ref.path), doc.data())
      }
      await batch.commit()
    }
    written += slice.length
    console.log(`  ${describe}: ${written}/${docs.length}`)
  }
  return written
}

async function main() {
  console.log(DRY_RUN ? '== 미리보기 (쓰기 없음) ==' : '== 이전 시작 ==')

  const brands = (await source.collection('brands').get()).docs
  console.log(`brands ${brands.length}건`)
  await copyDocs(brands, 'brands')

  const links = (await source.collection('shareLinks').get()).docs
  console.log(`shareLinks ${links.length}건`)
  await copyDocs(links, 'shareLinks')

  let edits = 0
  let settings = 0
  for (const link of links) {
    const editDocs = (await link.ref.collection('edits').get()).docs
    if (editDocs.length) edits += await copyDocs(editDocs, `  ${link.id}/edits`)

    const settingDocs = (await link.ref.collection('settings').get()).docs
    if (settingDocs.length) settings += await copyDocs(settingDocs, `  ${link.id}/settings`)
  }

  console.log('---')
  console.log(`brands ${brands.length} · shareLinks ${links.length} · edits ${edits} · settings ${settings}`)
  console.log(DRY_RUN ? '미리보기라 아무것도 쓰지 않았습니다.' : '이전 완료.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
