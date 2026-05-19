import { NextRequest, NextResponse } from 'next/server'
import { getOpenAIClient } from '@/lib/openai/client'
import { getDoc } from '@/lib/services/docs'
import { collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore'
import { getFirestoreInstance } from '@/lib/firebase/firestore'

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

    // 각 청크에 임베딩 생성
    let embeddedCount = 0
    for (const chunkDoc of snapshot.docs) {
      const chunkData = chunkDoc.data()
      if (!chunkData.embedding) {
        try {
          const response = await client.embeddings.create({
            model: 'text-embedding-3-small',
            input: chunkData.content.slice(0, 8000),
          })
          const embedding = response.data[0].embedding
          await updateDoc(doc(db, 'docChunks', chunkDoc.id), { embedding })
          embeddedCount++
        } catch (err) {
          console.error(`청크 ${chunkDoc.id} 임베딩 실패:`, err)
        }
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
