// 서버 전용 모듈 - 클라이언트에서 import 금지
import { google } from 'googleapis'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  size?: string
}

export function getDriveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_PRIVATE_KEY
  if (!email || !key) return null

  try {
    const auth = new google.auth.JWT({
      email,
      key: key.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    })
    return google.drive({ version: 'v3', auth })
  } catch {
    return null
  }
}

type DriveClient = NonNullable<ReturnType<typeof getDriveClient>>

async function listFolderRecursive(
  drive: DriveClient,
  folderId: string,
  results: DriveFile[]
): Promise<void> {
  let pageToken: string | undefined = undefined
  do {
    const params: { q: string; fields: string; pageSize: number; pageToken?: string } = {
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,size)',
      pageSize: 100,
    }
    if (pageToken) params.pageToken = pageToken
    const res = await drive.files.list(params)
    const files = res.data.files ?? []
    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        await listFolderRecursive(drive, file.id!, results)
      } else {
        results.push({
          id: file.id!,
          name: file.name!,
          mimeType: file.mimeType!,
          modifiedTime: file.modifiedTime ?? '',
          size: file.size ?? undefined,
        })
      }
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
}

export async function listDriveFiles(folderId: string): Promise<DriveFile[]> {
  const drive = getDriveClient()
  if (!drive) return []

  const results: DriveFile[] = []
  await listFolderRecursive(drive, folderId, results)
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
    // Google Workspace 파일
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

    // 일반 파일 다운로드 후 처리
    const res = await drive.files.get(
      { fileId, alt: 'media' },
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

    const textTypes = [
      'text/plain',
      'text/markdown',
      'application/json',
      'text/csv',
      'text/html',
    ]
    const textExtensions = ['.txt', '.md', '.json', '.csv', '.html', '.htm']
    const isText =
      textTypes.includes(mimeType) ||
      textExtensions.some((ext) => fileName.toLowerCase().endsWith(ext))

    if (isText) {
      return buffer.toString('utf-8')
    }

    // 이미지, 동영상 등 지원 불가 파일
    return null
  } catch (err) {
    console.error(`Drive 파일 텍스트 추출 오류 [${fileName}]:`, err)
    return null
  }
}
