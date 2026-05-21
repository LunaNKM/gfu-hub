import { NextRequest, NextResponse } from 'next/server'
import { getOpenAIClient } from '@/lib/openai/client'
import { getDoc } from '@/lib/services/docs'
import { collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore'
import { getFirestoreInstance } from '@/lib/firebase/firestore'
import { logAiUsage } from '@/lib/services/usage'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const body = await req.json()
    const { docId } = body

    if (!docId) {
      return NextResponse.json({ error: 'docId가 없습니다.' }, { status: 400 })
    }

    const client = getOpenAIClient()
    if (!client) {
      return NextResponse.json({ error: 'OpenAI API 키가 설정되지 않았습니다.' }, { status: 503 })
    }

    const document = await getDoc(docId)
    if (!document) {
      return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })
    }

    const db = getFirestoreInstance()
    if (!db) {
      return NextResponse.json({ error: 'Firestore가 초기화되지 않았습니다.' }, { status: 503 })
    }

    // 해당 문서의 청크 조회
    const q = query(collection(db, 'docChunks'), where('docId', '==', docId))
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return NextResponse.json({ error: '청크가 없습니다. 먼저 문서를 저장하세요.' }, { status: 400 })
    }

    // 각 청크에 임베딩 생성 (이미 있는 청크는 스킵)
    let embeddedCount = 0
    let totalInputTokens = 0

    for (const chunkDoc of snapshot.docs) {
      const chunkData = chunkDoc.data()
      if (!chunkData.embedding) {
        try {
          // TASK 3: Contextual Retrieval — 문서 제목+카테고리를 프리픽스로 붙여 임베딩 품질 향상
          // 청크 단독 임베딩보다 검색 정확도 35~49% 개선 (Anthropic 2024 기법)
          const contextPrefix = `[문서: ${document.title} | ${document.category}]\n\n`
          const embeddingInput = (contextPrefix + (chunkData.content as string)).slice(0, 8000)
          const response = await client.embeddings.create({
            model: 'text-embedding-3-small',
            input: embeddingInput,
          })
          const embedding = response.data[0].embedding
          await updateDoc(doc(db, 'docChunks', chunkDoc.id), { embedding })
          totalInputTokens += response.usage?.prompt_tokens ?? 0
          embeddedCount++
        } catch (err) {
          console.error(`청크 ${chunkDoc.id} 임베딩 실패:`, err)
        }
      }
    }

    // 임베딩 비용 로그 (새로 생성된 청크가 있는 경우만)
    if (embeddedCount > 0 && totalInputTokens > 0) {
      try {
        const jwtToken = authHeader.replace('Bearer ', '')
        const parts = jwtToken.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))
          const userId = payload.user_id || payload.sub || payload.uid
          const userEmail = payload.email ?? undefined
          if (userId) {
            await logAiUsage({
              userId,
              userEmail,
              model: 'text-embedding-3-small',
              inputTokens: totalInputTokens,
              outputTokens: 0,
              totalTokens: totalInputTokens,
              cachedTokens: 0,
              feature: 'embedding',
              success: true,
            })
          }
        }
      } catch (logErr) {
        console.error('임베딩 사용량 로그 실패:', logErr)
      }
    }

    return NextResponse.json({
      success: true,
      message: `${embeddedCount}개 청크에 임베딩이 생성되었습니다.`,
      embeddedCount,
    })
  } catch (error) {
    console.error('Embed API 오류:', error)
    return NextResponse.json({ error: '임베딩 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
