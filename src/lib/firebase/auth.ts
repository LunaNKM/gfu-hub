import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  User,
  Auth,
} from 'firebase/auth'
import { doc, getDoc, getFirestore } from 'firebase/firestore'
import { getFirebaseApp } from './config'

function getAuthInstance(): Auth | null {
  const app = getFirebaseApp()
  if (!app) return null
  return getAuth(app)
}

// 도메인 & 비활성화 체크 공통 함수
async function validateUser(user: User): Promise<string | null> {
  if (!user.email?.endsWith('@gfutures.co')) {
    await firebaseSignOut(getAuthInstance()!)
    return '@gfutures.co 이메일만 로그인할 수 있습니다.'
  }

  const app = getFirebaseApp()
  if (app && user.email) {
    try {
      const db = getFirestore(app)
      const disabledDoc = await getDoc(doc(db, 'disabledUsers', user.email))
      if (disabledDoc.exists() && disabledDoc.data()?.disabled === true) {
        await firebaseSignOut(getAuthInstance()!)
        return '비활성화된 계정입니다. 관리자에게 문의하세요.'
      }
    } catch {
      // Firestore 접근 실패 시 계속 진행
    }
  }

  return null
}

export async function signInWithGoogle(): Promise<{ user: User | null; error: string | null }> {
  const auth = getAuthInstance()
  if (!auth) {
    return { user: null, error: 'Firebase가 설정되지 않았습니다.' }
  }

  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ hd: 'gfutures.co' })

  // popup 방식 우선 시도 (Electron은 main.js에서 팝업 허용 처리)
  try {
    const result = await signInWithPopup(auth, provider)
    const user = result.user
    const validationError = await validateUser(user)
    if (validationError) return { user: null, error: validationError }
    return { user, error: null }
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string }

    // popup이 완전히 막힌 환경에서만 redirect로 폴백
    if (err.code === 'auth/popup-blocked') {
      try {
        await signInWithRedirect(auth, provider)
        return { user: null, error: null }
      } catch (redirectError: unknown) {
        const rErr = redirectError as { message?: string }
        return { user: null, error: rErr.message || '로그인 중 오류가 발생했습니다.' }
      }
    }

    if (err.code === 'auth/popup-closed-by-user') {
      return { user: null, error: '로그인이 취소되었습니다.' }
    }

    return { user: null, error: err.message || '로그인 중 오류가 발생했습니다.' }
  }
}

// 페이지 로드 시 redirect 결과 처리 (AuthContext에서 호출)
export async function handleRedirectResult(): Promise<{ user: User | null; error: string | null }> {
  const auth = getAuthInstance()
  if (!auth) return { user: null, error: null }

  try {
    const result = await getRedirectResult(auth)
    if (!result) return { user: null, error: null }

    const user = result.user
    const validationError = await validateUser(user)
    if (validationError) return { user: null, error: validationError }
    return { user, error: null }
  } catch (error: unknown) {
    const err = error as { message?: string }
    return { user: null, error: err.message || '로그인 처리 중 오류가 발생했습니다.' }
  }
}

export async function signOut(): Promise<void> {
  const auth = getAuthInstance()
  if (!auth) return
  await firebaseSignOut(auth)
}

export function onAuthStateChanged(callback: (user: User | null) => void): () => void {
  const auth = getAuthInstance()
  if (!auth) {
    callback(null)
    return () => {}
  }
  return firebaseOnAuthStateChanged(auth, callback)
}
