/**
 * 일본 시장 인텔리전스 피드 생성
 *
 * GET  → Vercel Cron (Authorization: Bearer CRON_SECRET)
 * POST → 수동 트리거 (Authorization: Bearer {uid})
 *
 * 매일 UTC 01:00 (JST 10:00) 실행
 */

import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, getApps } from 'firebase/app'
import { getFirestore, collection, addDoc, Timestamp } from 'firebase/firestore'
import OpenAI from 'openai'
import { MarketBriefTopic } from '@/types'

// ── Firebase 초기화 (서버사이드) ───────────────────────────────
function getDb() {
  const existing = getApps().find((a) => a.name === '[DEFAULT]') ?? getApps()[0]
  const app =
    existing ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    })
  return getFirestore(app)
}

// ── 인증 확인 ─────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  const h = req.headers.get('Authorization')
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return false
  // Vercel Cron secret 또는 임의 uid (로그인 사용자 식별)
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && token === cronSecret) return true
  // UID 기반 수동 트리거 (비어있지 않으면 통과)
  return token.length > 0
}

// ── Tavily 검색 ───────────────────────────────────────────────
interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
}

async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return []
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        include_answer: false,
        include_raw_content: false,
        max_results: 5,
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map((r: TavilyResult) => ({
      title: r.title,
      url: r.url,
      content: r.content?.slice(0, 600) ?? '',
      score: r.score ?? 0,
    }))
  } catch {
    return []
  }
}

// ── 메인 브리핑 생성 로직 ─────────────────────────────────────
export async function generateDailyBrief(): Promise<{
  date: string
  summary: string
  topics: MarketBriefTopic[]
  sources: { title: string; url: string }[]
}> {
  const today = new Date().toISOString().slice(0, 10)

  // 5가지 검색 쿼리 병렬 실행
  const queries = [
    '日本 SNS インフルエンサー マーケティング トレンド 最新',
    '日本 Instagram TikTok バイラル 話題',
    'Japan social media influencer trend',
    '日本 美容 フード ライフスタイル SNS トレンド',
    '日本市場 デジタルマーケティング 最新動向',
  ]

  const allResults = await Promise.all(queries.map(tavilySearch))
  const flatResults = allResults
    .flat()
    .filter((r, i, arr) => arr.findIndex((x) => x.url === r.url) === i) // 중복 URL 제거
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)

  if (flatResults.length === 0) {
    return {
      date: today,
      summary: '검색 결과를 가져올 수 없습니다. Tavily API 키를 확인하세요.',
      topics: [],
      sources: [],
    }
  }

  // GPT 요약
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return {
      date: today,
      summary: 'OpenAI API 키가 설정되지 않았습니다.',
      topics: [],
      sources: flatResults.slice(0, 5).map((r) => ({ title: r.title, url: r.url })),
    }
  }

  const openai = new OpenAI({ apiKey: openaiKey })
  const searchContext = flatResults
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.content}`)
    .join('\n\n')

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    max_tokens: 1200,
    messages: [
      {
        role: 'system',
        content: `당신은 일본 디지털 마케팅 전문가입니다. 검색 결과를 분석하여 일본 SNS 트렌드 브리핑을 한국어로 작성하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "summary": "전체 트렌드 2-3문장 요약",
  "topics": [
    { "title": "주제명", "description": "2-3문장 설명", "source": "출처 제목(선택)" }
  ]
}

topics는 3-5개, 실제 검색 결과에서 확인된 내용만 포함하세요.`,
      },
      {
        role: 'user',
        content: `오늘(${today}) 일본 SNS 트렌드 검색 결과:\n\n${searchContext}\n\n위 내용을 바탕으로 브리핑을 작성해주세요.`,
      },
    ],
    response_format: { type: 'json_object' },
  })

  let parsed: { summary: string; topics: MarketBriefTopic[] } = {
    summary: '',
    topics: [],
  }
  try {
    parsed = JSON.parse(response.choices[0].message.content ?? '{}')
  } catch {
    parsed.summary = response.choices[0].message.content ?? ''
  }

  return {
    date: today,
    summary: parsed.summary || '요약 생성 실패',
    topics: parsed.topics || [],
    sources: flatResults.slice(0, 8).map((r) => ({ title: r.title, url: r.url })),
  }
}

// ── GET: Vercel Cron 진입점 ───────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  try {
    const brief = await generateDailyBrief()
    const db = getDb()
    const now = new Date()
    const expiresAt = new Date(now)
    expiresAt.setDate(expiresAt.getDate() + 30)

    await addDoc(collection(db, 'marketBriefs'), {
      ...brief,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(expiresAt),
    })

    return NextResponse.json({ ok: true, date: brief.date, topicsCount: brief.topics.length })
  } catch (err) {
    console.error('브리핑 생성 오류:', err)
    return NextResponse.json({ error: '브리핑 생성 실패' }, { status: 500 })
  }
}

// ── POST: 수동 트리거 (UI에서 호출) ──────────────────────────
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  try {
    const brief = await generateDailyBrief()
    const db = getDb()
    const now = new Date()
    const expiresAt = new Date(now)
    expiresAt.setDate(expiresAt.getDate() + 30)

    const ref = await addDoc(collection(db, 'marketBriefs'), {
      ...brief,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(expiresAt),
    })

    return NextResponse.json({
      ok: true,
      id: ref.id,
      date: brief.date,
      topicsCount: brief.topics.length,
    })
  } catch (err) {
    console.error('브리핑 생성 오류:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '브리핑 생성 실패' },
      { status: 500 }
    )
  }
}
