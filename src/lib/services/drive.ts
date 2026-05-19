// 서버 전용 모듈 - 클라이언트에서 import 금지
import { google } from 'googleapis'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  size?: string
}

export interface DriveFilePage {
  files: DriveFile[]
  nextPageToken: string | null
}

export function getDriveClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) return null

  try {
    const auth = new google.auth.OAuth2(clientId, clientSecret)
    auth.setCredentials({ refresh_token: refreshToken })
    return google.drive({ version: 'v3', auth })
  } catch {
    return null
  }
}

/**
 * 폴더 내 파일을 pageToken 기반으로 페이지 단위로 가져옴.
 * 재귀 스캔 없이 'ancestors' 쿼리로 하위 폴더까지 한 번에 검색.
 */
export async function listDriveFilesPage(
  folderId: string,
  pageSize: number = 10,
  pageToken?: string
): Promise<DriveFilePage> {
  const drive = getDriveClient()
  if (!drive) return { files: [], nextPageToken: null }

  const res = await drive.files.list({
    q: `'${folderId}' in ancestors and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,size)',
    pageSize,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
    ...(pageToken ? { pageToken } : {}),
  })

  const files = (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
    modifiedTime: f.modifiedTime ?? '',
    size: f.size ?? undefined,
  }))

  return {
    files,
    nextPageToken: res.data.nextPageToken ?? null,
  }
}

// 하위 호환성을 위해 유지 (status route에서 사용)
export async function listDriveFiles(folderId: string): Promise<DriveFile[]> {
  const drive = getDriveClient()
  if (!drive) return []

  const results: DriveFile[] = []
  let pageToken: string | undefined = undefined

  do {
    const res: Awaited<ReturnType<typeof drive.files.list>> = await drive.files.list({
      q: `'${folderId}' in ancestors and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,size)',
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
      ...(pageToken ? { pageToken } : {}),
    })

    for (const f of res.data.files ?? []) {
      results.push({
        id: f.id!,
        name: f.name!,
        mimeType: f.mimeType!,
        modifiedTime: f.modifiedTime ?? '',
        size: f.size ?? undefined,
      })
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  return results
}

export async function extractDriveFileText(
  fileId: string,
  mimeType: string,
  fileName: string
): Promise<string | null> {
  const drive = getDriveClient()
  if (!drive) return null

  try {
    if (mimeType === 'application/vnd.google-apps.document') {
      const res = await drive.files.export(
        { fileId, mimeType: 'text/plain' },
        { responseType: 'text' }
      )
      return (res.data as string) ?? null
    }

    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      const res = await drive.files.export(
        { fileId, mimeType: 'text/csv' },
        { responseType: 'text' }
      )
      return (res.data as string) ?? null
    }

    if (mimeType === 'application/vnd.google-apps.presentation') {
      const res = await drive.files.export(
        { fileId, mimeType: 'text/plain' },
        { responseType: 'text' }
      )
      return (res.data as string) ?? null
    }

    const res = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    )
    const buffer = Buffer.from(res.data as ArrayBuffer)

    if (mimeType === 'application/pdf') {
      const pdfParse = (await import('pdf-parse')).default
      const data = await pdfParse(buffer)
      return data.text
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileName.endsWith('.docx')
    ) {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      return result.value
    }

    const textTypes = ['text/plain', 'text/markdown', 'application/json', 'text/csv', 'text/html']
    const textExtensions = ['.txt', '.md', '.json', '.csv', '.html', '.htm']
    const isText =
      textTypes.includes(mimeType) ||
      textExtensions.some((ext) => fileName.toLowerCase().endsWith(ext))

    if (isText) {
      return buffer.toString('utf-8')
    }

    return null
  } catch (err) {
    console.error(`Drive 파일 텍스트 추출 오류 [${fileName}]:`, err)
    return null
  }
}
