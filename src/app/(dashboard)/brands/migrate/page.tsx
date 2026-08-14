'use client'

/**
 * 브랜드 관리 데이터 이전 도구 (일회성).
 *
 * 서비스 계정을 쓸 수 없어 서버에서 admin SDK 로 옮기는 방법이 막혀 있으므로,
 * 로그인한 @gfutures.co 계정의 권한을 그대로 빌려 브라우저에서 옮긴다.
 * 원본 프로젝트와 gfu-hub 양쪽 규칙 모두 이 계정에 brands/shareLinks 읽기·쓰기를
 * 허용하기 때문에 추가 권한 없이 동작한다.
 *
 * 이전이 끝나면 이 폴더(src/app/(dashboard)/brands/migrate)를 통째로 지우면 된다.
 * 사이드바에는 노출하지 않으므로 주소를 직접 입력해야 열린다.
 */

import React, { useState } from 'react'
import { FirebaseApp, deleteApp, initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth, signInWithPopup } from 'firebase/auth'
import {
  QueryDocumentSnapshot,
  collection,
  doc,
  getDocs,
  getFirestore,
  writeBatch,
} from 'firebase/firestore'
import { firebaseDb } from '@/lib/firebase/client'

type SourceConfig = {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
  storageBucket?: string
  messagingSenderId?: string
}

type Counts = { brands: number; shareLinks: number; edits: number; settings: number }

const EMPTY: Counts = { brands: 0, shareLinks: 0, edits: 0, settings: 0 }

// Firestore 배치는 한 번에 500개까지라 그보다 작게 끊는다.
const BATCH_LIMIT = 400

function parseConfig(raw: string): SourceConfig {
  // Firebase 콘솔이 주는 형태(`const firebaseConfig = { apiKey: "..." }`)를
  // 그대로 붙여 넣을 수 있게 앞뒤 군더더기를 걷어내고 키에 따옴표를 채운다.
  const braced = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
  if (!braced) throw new Error('설정 객체를 찾지 못했습니다.')
  const json = braced
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/'/g, '"')
    .replace(/,(\s*})/g, '$1')
  const parsed = JSON.parse(json) as Partial<SourceConfig>
  if (!parsed.apiKey || !parsed.projectId || !parsed.authDomain || !parsed.appId) {
    throw new Error('apiKey, authDomain, projectId, appId 가 모두 필요합니다.')
  }
  return parsed as SourceConfig
}

export default function BrandsMigratePage() {
  const [configText, setConfigText] = useState('')
  const [sourceApp, setSourceApp] = useState<FirebaseApp | null>(null)
  const [sourceEmail, setSourceEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [counts, setCounts] = useState<Counts>(EMPTY)
  const [error, setError] = useState('')

  const say = (line: string) => setLog((current) => [...current, line])

  async function connect() {
    setError('')
    setBusy(true)
    try {
      const config = parseConfig(configText)
      if (sourceApp) await deleteApp(sourceApp)
      const app = initializeApp(config, 'migration-source')
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ hd: 'gfutures.co' })
      const result = await signInWithPopup(getAuth(app), provider)
      setSourceApp(app)
      setSourceEmail(result.user.email ?? '')
      say(`원본 프로젝트 ${config.projectId} 에 ${result.user.email} 로 연결했습니다.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  async function run(dryRun: boolean) {
    if (!sourceApp || !firebaseDb) return
    setError('')
    setBusy(true)
    setLog([])
    setCounts(EMPTY)
    const tally = { ...EMPTY }
    try {
      const source = getFirestore(sourceApp)

      async function copy(docs: QueryDocumentSnapshot[], label: string) {
        if (!docs.length) return 0
        for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
          const slice = docs.slice(i, i + BATCH_LIMIT)
          if (!dryRun) {
            const batch = writeBatch(firebaseDb!)
            for (const snapshot of slice) {
              batch.set(doc(firebaseDb!, snapshot.ref.path), snapshot.data())
            }
            await batch.commit()
          }
        }
        say(`${label} ${docs.length}건`)
        return docs.length
      }

      const brands = (await getDocs(collection(source, 'brands'))).docs
      tally.brands = await copy(brands, 'brands')

      const links = (await getDocs(collection(source, 'shareLinks'))).docs
      tally.shareLinks = await copy(links, 'shareLinks')

      for (const link of links) {
        const edits = (await getDocs(collection(source, 'shareLinks', link.id, 'edits'))).docs
        tally.edits += await copy(edits, `  ${link.id}/edits`)

        const settings = (await getDocs(collection(source, 'shareLinks', link.id, 'settings'))).docs
        tally.settings += await copy(settings, `  ${link.id}/settings`)
      }

      setCounts(tally)
      say(dryRun ? '미리보기라 아무것도 쓰지 않았습니다.' : '이전 완료.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl p-6 space-y-6">
      <header>
        <h1 className="text-lg font-bold text-gray-900">브랜드 데이터 이전</h1>
        <p className="mt-1 text-sm text-gray-500">
          원본 Firebase 프로젝트의 brands · shareLinks 를 이 허브 프로젝트로 복사합니다.
          같은 문서 ID 로 덮어쓰므로 여러 번 돌려도 결과는 같습니다.
        </p>
      </header>

      <section className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          1. 원본 프로젝트 웹 앱 설정
        </label>
        <p className="text-xs text-gray-500">
          Firebase 콘솔 &gt; 프로젝트 설정 &gt; 내 앱 &gt; SDK 설정에서 firebaseConfig 를
          그대로 붙여 넣으세요. 공개 설정값이라 비밀 키가 아닙니다.
        </p>
        <textarea
          value={configText}
          onChange={(event) => setConfigText(event.target.value)}
          rows={9}
          spellCheck={false}
          placeholder={'const firebaseConfig = {\n  apiKey: "...",\n  authDomain: "....firebaseapp.com",\n  projectId: "...",\n  appId: "..."\n};'}
          className="w-full rounded-lg border border-gray-200 p-3 font-mono text-xs"
        />
        <button
          onClick={connect}
          disabled={busy || !configText.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          원본 프로젝트에 로그인
        </button>
        {sourceEmail && (
          <p className="text-xs text-green-600">연결됨 · {sourceEmail}</p>
        )}
      </section>

      <section className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">2. 이전</label>
        <div className="flex gap-2">
          <button
            onClick={() => run(true)}
            disabled={busy || !sourceApp}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"
          >
            미리보기 (쓰기 없음)
          </button>
          <button
            onClick={() => run(false)}
            disabled={busy || !sourceApp}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            이전 실행
          </button>
        </div>
        <p className="text-xs text-gray-500">
          실제 전환일에는 원본 앱 사용을 멈춘 상태에서 마지막으로 한 번 더 돌리세요.
        </p>
      </section>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>
      )}

      {(log.length > 0 || busy) && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-gray-700">진행 상황</h2>
          <pre className="max-h-80 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
            {log.join('\n')}
            {busy && '\n작업 중…'}
          </pre>
          {!busy && log.length > 0 && (
            <p className="text-xs text-gray-500">
              brands {counts.brands} · shareLinks {counts.shareLinks} · edits{' '}
              {counts.edits} · settings {counts.settings}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
