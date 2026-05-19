import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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

export async function signInWithGoogle(): Promise<{ user: User | null; error: string | null }> {
  const auth = getAuthInstance()
  if (!auth) {
    return { user: null, error: 'Firebase가 설정되지 않았습니다.' }
  }

  try {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ hd: 'gfutures.co' })
    const result = await signInWithPopup(auth, provider)
    const user = result.user

    // 이메일 도메인 체크
    if (!user.email?.endsWith('@gfutures.co')) {
      await firebaseSignOut(auth)
      return { user: null, error: '@gfutures.co 이메일만 로그인할 수 있습니다.' }
    }

    // 비활성화된 사용자 체크
    const app = getFirebaseApp()
    if (app && user.email) {
      try {
        const db = getFirestore(app)
        const disabledDoc = await getDoc(doc(db, 'disabledUsers', user.email))
        if (disabledDoc.exists() && disabledDoc.data()?.disabled === true) {
          await firebaseSignOut(auth)
          return { user: null, error: '비활성화된 계정입니다. 관리자에게 문의하세요.' }
        }
      } catch {
        // Firestore 접근 실패 시 계속 진행
      }
    }

    return { user, error: null }
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string }
    if (err.code === 'auth/popup-closed-by-user') {
      return { user: null, error: '로그인이 취소되었습니다.' }
    }
    return { user: null, error: err.message || '로그인 중 오류가 발생했습니다.' }
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
