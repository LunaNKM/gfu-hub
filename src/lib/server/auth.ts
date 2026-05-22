import { NextRequest } from 'next/server'

export interface RequestUser {
  uid: string
  email?: string
  token: string
}

export function requireAuth(req: NextRequest): RequestUser | Response {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  try {
    const parts = token.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))
      const uid = payload.user_id || payload.sub || payload.uid
      const email = payload.email as string | undefined
      if (!uid) throw new Error('uid 없음')
      if (email && !email.endsWith('@gfutures.co')) {
        return Response.json({ error: '권한이 없습니다.' }, { status: 403 })
      }
      return { uid, email, token }
    }
  } catch {
    return Response.json({ error: '인증 실패' }, { status: 401 })
  }

  // TODO: firebase-admin 도입 후 verifyIdToken으로 교체.
  if (token.length > 0) return { uid: token, token }
  return Response.json({ error: '인증 실패' }, { status: 401 })
}

export function isAuthResponse(value: RequestUser | Response): value is Response {
  return value instanceof Response
}
