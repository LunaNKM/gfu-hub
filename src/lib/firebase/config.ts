import { FirebaseApp, getApps, initializeApp } from 'firebase/app'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

let firebaseApp: FirebaseApp | null = null

function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    return null
  }

  // 이름 없는 기본 앱만 골라낸다. 데이터 이전 도구처럼 두 번째 앱(다른 프로젝트)을
  // 띄우는 화면이 있어서, getApps()[0] 로 집으면 엉뚱한 프로젝트를 볼 수 있다.
  const existing = getApps().find((app) => app.name === '[DEFAULT]')
  if (existing) {
    return existing
  }

  firebaseApp = initializeApp(firebaseConfig)
  return firebaseApp
}

export { getFirebaseApp }
export default getFirebaseApp
