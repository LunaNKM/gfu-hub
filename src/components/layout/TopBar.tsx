'use client'

import React, { useState } from 'react'
import { Search, LogOut } from 'lucide-react'
import Image from 'next/image'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'

export function TopBar() {
  const { user, signOut } = useAuth()
  const [search, setSearch] = useState('')
  const router = useRouter()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (search.trim()) {
      router.push(`/docs?q=${encodeURIComponent(search.trim())}`)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  return (
    <header className="flex items-center h-14 px-4 border-b border-gray-200 bg-white gap-4">
      {/* 검색창 */}
      <form onSubmit={handleSearch} className="flex-1 max-w-sm">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="문서 검색..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-gray-50"
          />
        </div>
      </form>

      <div className="flex-1" />

      {/* 프로필 + 로그아웃 */}
      <div className="flex items-center gap-3">
        {user && (
          <div className="flex items-center gap-2">
            {user.photoURL ? (
              <Image
                src={user.photoURL}
                alt={user.displayName || ''}
                width={28}
                height={28}
                className="rounded-full"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium">
                {user.email?.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm text-gray-700 hidden sm:block">
              {user.displayName || user.email}
            </span>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          <span className="hidden sm:block">로그아웃</span>
        </button>
      </div>
    </header>
  )
}

export default TopBar
