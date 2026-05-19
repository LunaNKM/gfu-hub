'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User } from 'firebase/auth'
import {
  signInWithGoogle as firebaseSignIn,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  handleRedirectResult,
} from '@/lib/firebase/auth'

interface AuthContextType {
  user: User | null
  loading: boolean
  userEmail: string | null
  authError: string | null
  signIn: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  userEmail: null,
  authError: null,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    // Firebase 인증 상태 감지
    const unsubscribe = onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })

    // redirect 로그인 결과 처리 (팝업 차단 시 redirect 방식 사용 후 돌아왔을 때)
    handleRedirectResult().then(({ error }) => {
      if (error) setAuthError(error)
    })

    return unsubscribe
  }, [])

  const signIn = async (): Promise<{ error: string | null }> => {
    setAuthError(null)
    const result = await firebaseSignIn()
    if (result.error) {
      setAuthError(result.error)
      return { error: result.error }
    }
    return { error: null }
  }

  const signOut = async (): Promise<void> => {
    await firebaseSignOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        userEmail: user?.email ?? null,
        authError,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  return useContext(AuthContext)
}

export { AuthContext }
