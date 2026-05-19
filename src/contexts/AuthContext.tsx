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
    let authStateResolved = false
    let redirectResolved = false

    // 둘 다 완료돼야 loading = false
    const tryFinishLoading = () => {
      if (authStateResolved && redirectResolved) {
        setLoading(false)
      }
    }

    // 1. Firebase 인증 상태 감지
    const unsubscribe = onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser)
      authStateResolved = true
      tryFinishLoading()
    })

    // 2. redirect 로그인 결과 처리
    //    (Google 로그인 후 돌아왔을 때 세션을 확정짓는 단계)
    handleRedirectResult().then(({ error }) => {
      if (error) setAuthError(error)
      redirectResolved = true
      tryFinishLoading()
    })

    // 안전장치: 3초 안에 안 끝나면 강제로 loading 해제
    const timeout = setTimeout(() => {
      redirectResolved = true
      tryFinishLoading()
    }, 3000)

    return () => {
      unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const signIn = async (): Promise<{ error: string | null }> => {
    setAuthError(null)
    const result = await firebaseSignIn()
    if (result.error) {
      setAuthError(result.error)
      return { error: result.error }
    }
    // redirect 방식이면 여기까지 오지 않고 페이지 이동됨
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
