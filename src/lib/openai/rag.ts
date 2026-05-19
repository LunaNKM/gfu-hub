import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { getFirestoreInstance } from '../firebase/firestore'
import { DocChunk } from '@/types'
import { getOpenAIClient } from './client'

export async function getEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient()
  if (!client) return []

  try {
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    })
    return response.data[0].embedding
  } catch (error) {
    console.error('임베딩 생성 오류:', error)
    return []
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0)
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))
  if (normA === 0 || normB === 0) return 0
  return dot / (normA * normB)
}

function keywordScore(content: string, query: string): number {
  const lowerContent = content.toLowerCase()
  const terms = query.toLowerCase().split(/\s+/)
  const matches = terms.filter((term) => lowerContent.includes(term))
  return matches.length / terms.length
}

export async function searchRelevantDocs(
  searchQuery: string,
  limit = 5
): Promise<{ docId: string; title: string; content: string; score: number }[]> {
  const db = getFirestoreInstance()
  if (!db) return []

  try {
    const q = query(collection(db, 'docChunks'), orderBy('updatedAt', 'desc'))
    const snapshot = await getDocs(q)
    const chunks: DocChunk[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as DocChunk[]

    if (chunks.length === 0) return []

    // 임베딩 시도
    const queryEmbedding = await getEmbedding(searchQuery)

    let scored: { docId: string; title: string; content: string; score: number }[]

    if (queryEmbedding.length > 0) {
      // 임베딩 기반 유사도 검색
      scored = chunks
        .filter((chunk) => chunk.embedding && chunk.embedding.length > 0)
        .map((chunk) => ({
          docId: chunk.docId,
          title: chunk.title,
          content: chunk.content,
          score: cosineSimilarity(queryEmbedding, chunk.embedding!),
        }))

      // 임베딩 없는 청크는 키워드로 폴백
      const noEmbedding = chunks
        .filter((chunk) => !chunk.embedding || chunk.embedding.length === 0)
        .map((chunk) => ({
          docId: chunk.docId,
          title: chunk.title,
          content: chunk.content,
          score: keywordScore(chunk.content, searchQuery) * 0.5,
        }))

      scored = [...scored, ...noEmbedding]
    } else {
      // 키워드 기반 폴백
      scored = chunks.map((chunk) => ({
        docId: chunk.docId,
        title: chunk.title,
        content: chunk.content,
        score: keywordScore(chunk.content, searchQuery),
      }))
    }

    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  } catch (error) {
    console.error('RAG 검색 오류:', error)
    return []
  }
}
