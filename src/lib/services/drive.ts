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

// Hobby 플랜에서 처리 가능한 파일 타입 체크
export function isSupportedFileType(mimeType: string, fileName: string): boolean {
  // Google Workspace 파일은 export API 사용 (메모리 효율적)
  if (
    mimeType === 'application/vnd.google-apps.document' ||
    mimeType === 'application/vnd.google-apps.spreadsheet' ||
    mimeType === 'application/vnd.google-apps.presentation'
  ) return true

  // 텍스트 기반 파일 (크기가 작음)
  const textTypes = ['text/plain', 'text/markdown', 'application/json', 'text/csv', 'text/html']
  const textExtensions = ['.txt', '.md', '.json', '.csv', '.html', '.htm']
  if (textTypes.includes(mimeType)) return true
  if (textExtensions.some((ext) => fileName.toLowerCase().endsWith(ext))) return true

  // PDF, DOCX 등 대용량 파싱 파일은 Hobby 플랜에서 메모리 초과 → 건너뜀
  return false
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

    // 텍스트 파일만 다운로드 (PDF/DOCX 제외)
    const textTypes = ['text/plain', 'text/markdown', 'application/json', 'text/csv', 'text/html']
    const textExtensions = ['.txt', '.md', '.json', '.csv', '.html', '.htm']
    const isText =
      textTypes.includes(mimeType) ||
      textExtensions.some((ext) => fileName.toLowerCase().endsWith(ext))

    if (isText) {
      const res = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'text' }
      )
      return (res.data as string) ?? null
    }

    return null
  } catch (err) {
    console.error(`Drive 파일 텍스트 추출 오류 [${fileName}]:`, err)
    return null
  }
}
