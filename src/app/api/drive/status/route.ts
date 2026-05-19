import { NextRequest, NextResponse } from 'next/server'
import { collection, getDocs, query, where, doc, getDoc, Timestamp } from 'firebase/firestore'
import { getFirestoreInstance } from '@/lib/firebase/firestore'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  const configured = !!(clientId && clientSecret && refreshToken && folderId)

  const db = getFirestoreInstance()
  if (!db) {
    return NextResponse.json({ configured, driveDocCount: 0, lastSyncAt: null })
  }

  try {
    // Drive에서 동기화된 문서 수
    const q = query(collection(db, 'docs'), where('source', '==', 'drive'))
    const snap = await getDocs(q)
    const driveDocCount = snap.size

    // 마지막 동기화 시간
    const syncSettingSnap = await getDoc(doc(db, 'settings', 'driveSync'))
    let lastSyncAt: string | null = null
    if (syncSettingSnap.exists()) {
      const data = syncSettingSnap.data()
      const ts = data.lastSyncAt
      if (ts instanceof Timestamp) {
        lastSyncAt = ts.toDate().toISOString()
      }
    }

    return NextResponse.json({ configured, driveDocCount, lastSyncAt })
  } catch (error) {
    console.error('Drive 상태 조회 오류:', error)
    return NextResponse.json({ configured, driveDocCount: 0, lastSyncAt: null })
  }
}
