'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User } from 'firebase/auth'
import { signInWithGoogle as firebaseSignIn, signOut as firebaseSignOut, onAuthStateChanged } from '@/lib/firebase/auth'

interface AuthContextType {
  user: User | null
  loading: boolean
  userEmail: string | null
  signIn: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  userEmail: null,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const signIn = async (): Promise<{ error: string | null }> => {
    const result = await firebaseSignIn()
    if (result.error) {
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
