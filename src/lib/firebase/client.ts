import { getFirebaseApp } from './config'
import { getFirestoreInstance } from './firestore'

/**
 * 브랜드 관리 화면이 쓰는 Firestore 핸들. 원래 gfutures_operation_system 은 자체
 * initializeApp 을 갖고 있었지만, 허브 안에서는 앱 인스턴스를 하나만 두어야
 * 엉뚱한 프로젝트를 바라보는 사고를 막을 수 있어 config.ts 를 그대로 재사용한다.
 */
export const isFirebaseConfigured = getFirebaseApp() !== null

export const firebaseDb = getFirestoreInstance()
