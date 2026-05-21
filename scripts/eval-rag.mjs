#!/usr/bin/env node
/**
 * RAG 평가 하네스 (TASK 7)
 *
 * 실행: node scripts/eval-rag.mjs
 * 환경변수: EVAL_BASE_URL (기본: http://localhost:3000), EVAL_ID_TOKEN (Firebase ID 토큰)
 *
 * testset.json의 각 쿼리를 /api/chat로 전송하고 응답을 평가.
 * 평가 기준: expectedKeywords가 응답에 포함되는지 (대소문자 무관, 한국어/영어 모두 체크)
 *
 * 출력:
 *   PASS/FAIL 여부, 응답 첫 200자, 키워드 매칭 상세, 종합 점수
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

const BASE_URL = process.env.EVAL_BASE_URL || 'http://localhost:3000'
const ID_TOKEN = process.env.EVAL_ID_TOKEN || ''
const TESTSET_PATH = join(__dir, '..', 'eval', 'testset.json')

if (!ID_TOKEN) {
  console.warn('⚠️  EVAL_ID_TOKEN 미설정 — 401 응답 예상. Firebase 콘솔에서 ID 토큰을 발급하세요.')
}

const testset = JSON.parse(readFileSync(TESTSET_PATH, 'utf-8'))

// ── SSE 응답 수집 ──────────────────────────────────────────────
async function fetchChatResponse(query, ragEnabled) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ID_TOKEN}`,
    },
    body: JSON.stringify({
      conversationId: `eval-${Date.now()}`,
      message: query,
      history: [],
      ragEnabled,
    }),
  })

  if (!res.ok) {
    return { content: '', plan: '', error: `HTTP ${res.status}` }
  }

  const text = await res.text()
  let content = ''
  let plan = ''
  let searchSummary = ''

  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue
    try {
      const data = JSON.parse(line.slice(6))
      if (data.type === 'chunk') content += data.content
      if (data.type === 'plan') plan = data.content
      if (data.type === 'search_done') searchSummary = data.content
    } catch { /* ignore */ }
  }

  return { content, plan, searchSummary, error: null }
}

// ── 키워드 매칭 ───────────────────────────────────────────────
function checkKeywords(response, keywords) {
  const lower = response.toLowerCase()
  return keywords.map((kw) => ({
    keyword: kw,
    found: lower.includes(kw.toLowerCase()),
  }))
}

// ── 메인 ─────────────────────────────────────────────────────
async function main() {
  console.log(`\n🧪 RAG 평가 시작 — ${testset.length}개 테스트 케이스`)
  console.log(`   Base URL: ${BASE_URL}`)
  console.log(`   토큰: ${ID_TOKEN ? '설정됨' : '미설정 (401 예상)'}`)
  console.log('─'.repeat(70))

  const results = []
  let passCount = 0

  for (const tc of testset) {
    const startMs = Date.now()
    process.stdout.write(`\n[${tc.id}] ${tc.description}\n  쿼리: "${tc.query}"\n  실행 중...`)

    let result
    try {
      result = await fetchChatResponse(tc.query, tc.ragEnabled)
    } catch (err) {
      result = { content: '', plan: '', error: err.message }
    }

    const elapsedMs = Date.now() - startMs
    const kwResults = checkKeywords(result.content, tc.expectedKeywords)
    const allFound = kwResults.every((k) => k.found)
    const hasError = !!result.error
    const pass = !hasError && (tc.expectedKeywords.length === 0 || allFound)

    if (pass) passCount++

    const icon = pass ? '✅ PASS' : hasError ? '❌ ERROR' : '⚠️  FAIL'
    console.log(`\r  ${icon} (${elapsedMs}ms)`)
    if (result.plan) console.log(`  Plan: ${result.plan}`)
    if (result.searchSummary) console.log(`  Search: ${result.searchSummary}`)
    if (result.error) {
      console.log(`  Error: ${result.error}`)
    } else {
      console.log(`  응답 (첫 200자): ${result.content.slice(0, 200).replace(/\n/g, ' ')}...`)
    }
    if (kwResults.length > 0) {
      const kwStr = kwResults.map((k) => `${k.found ? '✓' : '✗'} "${k.keyword}"`).join(', ')
      console.log(`  키워드: ${kwStr}`)
    }

    results.push({ id: tc.id, category: tc.category, pass, elapsedMs, error: result.error })
  }

  // ── 종합 리포트 ──────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70))
  console.log(`📊 평가 결과: ${passCount}/${testset.length} PASS (${Math.round((passCount / testset.length) * 100)}%)`)

  // 카테고리별 집계
  const byCategory = {}
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = { pass: 0, total: 0 }
    byCategory[r.category].total++
    if (r.pass) byCategory[r.category].pass++
  }
  console.log('\n카테고리별 결과:')
  for (const [cat, stat] of Object.entries(byCategory)) {
    const pct = Math.round((stat.pass / stat.total) * 100)
    console.log(`  ${cat}: ${stat.pass}/${stat.total} (${pct}%)`)
  }

  // 평균 레이턴시
  const avgMs = Math.round(results.reduce((s, r) => s + r.elapsedMs, 0) / results.length)
  const errorCount = results.filter((r) => r.error).length
  console.log(`\n평균 응답 시간: ${avgMs}ms`)
  console.log(`오류: ${errorCount}개`)
  console.log('═'.repeat(70))

  process.exit(passCount === testset.length ? 0 : 1)
}

main().catch((err) => {
  console.error('❌ 평가 실패:', err)
  process.exit(1)
})
