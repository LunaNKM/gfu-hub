export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    // PDF 처리
    if (mimeType === 'application/pdf') {
      try {
        const pdfParse = (await import('pdf-parse')).default
        const data = await pdfParse(buffer)
        return data.text || ''
      } catch {
        return '[PDF 텍스트 추출 실패]'
      }
    }

    // Excel 처리
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel'
    ) {
      try {
        const XLSX = await import('xlsx')
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        const texts: string[] = []

        workbook.SheetNames.forEach((sheetName) => {
          const sheet = workbook.Sheets[sheetName]
          const csv = XLSX.utils.sheet_to_csv(sheet)
          texts.push(`[시트: ${sheetName}]\n${csv}`)
        })

        return texts.join('\n\n')
      } catch {
        return '[Excel 텍스트 추출 실패]'
      }
    }

    // CSV 처리
    if (mimeType === 'text/csv') {
      try {
        const Papa = await import('papaparse')
        const text = buffer.toString('utf-8')
        const result = Papa.default.parse(text, { header: true })
        return JSON.stringify(result.data, null, 2)
      } catch {
        return buffer.toString('utf-8')
      }
    }

    // 텍스트 파일
    if (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/xml'
    ) {
      return buffer.toString('utf-8')
    }

    // 기타 파일
    return `[파일 형식: ${mimeType} - 텍스트 추출 미지원]`
  } catch (error) {
    console.error('텍스트 추출 오류:', error)
    return `[텍스트 추출 오류: ${mimeType}]`
  }
}
