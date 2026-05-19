export async function getSheetData(_range: string): Promise<unknown[][]> {
  const hasCredentials =
    process.env.GOOGLE_SHEETS_CREDENTIALS && process.env.GOOGLE_SHEETS_SPREADSHEET_ID

  if (!hasCredentials) {
    console.warn('Google Sheets 환경변수가 설정되지 않았습니다.')
    return [['설정 필요', 'GOOGLE_SHEETS_CREDENTIALS와 GOOGLE_SHEETS_SPREADSHEET_ID를 설정하세요.']]
  }

  // TODO: 실제 Google Sheets API 연동
  return []
}
