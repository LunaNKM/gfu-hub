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
 * 특정 폴더의 파일(non-folder)을 pageToken 기반으로 가져옴.
 * 첫 방문(pageToken 없음)일 때 하위 폴더 ID도 함께 반환.
 */
export async function listFolderPage(
  folderId: string,
  pageSize: number,
  pageToken?: string
): Promise<{ files: DriveFile[]; subfolderIds: string[]; nextPageToken: string | null }> {
  const drive = getDriveClient()
  if (!drive) return { files: [], subfolderIds: [], nextPageToken: null }

  const baseParams = {
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  }

  // 첫 방문: 하위 폴더 목록 가져오기
  let subfolderIds: string[] = []
  if (!pageToken) {
    const folderRes = await drive.files.list({
      ...baseParams,
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)',
      pageSize: 100,
    })
    subfolderIds = (folderRes.data.files ?? []).map((f) => f.id!)
  }

  // 파일 목록 (페이지네이션)
  const fileRes = await drive.files.list({
    ...baseParams,
    q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,size)',
    pageSize,
    ...(pageToken ? { pageToken } : {}),
  })

  const files = (fileRes.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
    modifiedTime: f.modifiedTime ?? '',
    size: f.size ?? undefined,
  }))

  return {
    files,
    subfolderIds,
    nextPageToken: fileRes.data.nextPageToken ?? null,
  }
}

// status route용
export async function listDriveFiles(folderId: string): Promise<DriveFile[]> {
  const results: DriveFile[] = []
  const folderQueue: string[] = [folderId]

  while (folderQueue.length > 0) {
    const currentFolder = folderQueue.shift()!
    let pageToken: string | undefined = undefined

    while (true) {
      const page = await listFolderPage(currentFolder, 100, pageToken)
      results.push(...page.files)
      folderQueue.push(...page.subfolderIds)
      if (!page.nextPageToken) break
      pageToken = page.nextPageToken
    }
  }

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

    if (isText) return buffer.toString('utf-8')

    return null
  } catch (err) {
    console.error(`Drive 파일 텍스트 추출 오류 [${fileName}]:`, err)
    return null
  }
}
