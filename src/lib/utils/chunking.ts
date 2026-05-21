export function chunkText(text: string, chunkSize = 1000, overlap = 150): string[] {
  if (!text || text.trim().length === 0) return []

  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    let chunk = text.slice(start, end)

    // 문장 경계에서 자르기 (마지막 마침표/줄바꿈 찾기)
    if (end < text.length) {
      const lastPeriod = Math.max(
        chunk.lastIndexOf('。'),
        chunk.lastIndexOf('.'),
        chunk.lastIndexOf('\n'),
        chunk.lastIndexOf('!'),
        chunk.lastIndexOf('?')
      )
      if (lastPeriod > chunkSize * 0.5) {
        chunk = text.slice(start, start + lastPeriod + 1)
      }
    }

    const trimmed = chunk.trim()
    if (trimmed.length > 0) {
      chunks.push(trimmed)
    }

    start = start + chunk.length - overlap
    if (start >= text.length) break
  }

  return chunks
}
