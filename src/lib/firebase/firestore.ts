import { getFirestore, Firestore } from 'firebase/firestore'
import { getFirebaseApp } from './config'

let firestoreInstance: Firestore | null = null

export function getFirestoreInstance(): Firestore | null {
  const app = getFirebaseApp()
  if (!app) return null

  if (!firestoreInstance) {
    firestoreInstance = getFirestore(app)
  }
  return firestoreInstance
}

export default getFirestoreInstance
