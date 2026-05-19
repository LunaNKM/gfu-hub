'use client'

import React from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LogOut, User, Mail } from 'lucide-react'
import Image from 'next/image'

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  return (
    <div className="p-6 max-w-2xl">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">설정</h1>
        <p className="text-sm text-gray-500 mt-0.5">계정 및 서비스 설정</p>
      </div>

      {/* 사용자 정보 */}
      <Card className="p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">내 계정</h2>
        <div className="flex items-center gap-4">
          {user?.photoURL ? (
            <Image
              src={user.photoURL}
              alt={user.displayName || ''}
              width={56}
              height={56}
              className="rounded-full"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-blue-500 flex items-center justify-center text-white text-xl font-bold">
              {user?.email?.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <User size={14} className="text-gray-400" />
              <span className="text-sm font-medium text-gray-900">
                {user?.displayName || '이름 없음'}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Mail size={14} className="text-gray-400" />
              <span className="text-sm text-gray-600">{user?.email}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Meta 인사이트 설정 */}
      <Card className="p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Meta 인사이트</h2>
        <p className="text-xs text-gray-400 mb-3">
          Meta 광고 데이터 연동 설정 (준비 중)
        </p>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500 text-center">이 기능은 준비 중입니다.</p>
        </div>
      </Card>

      {/* 로그아웃 */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">로그아웃</h2>
        <p className="text-xs text-gray-400 mb-3">GFU Hub에서 로그아웃합니다.</p>
        <Button variant="danger" size="sm" onClick={handleSignOut}>
          <LogOut size={14} className="mr-1.5" />
          로그아웃
        </Button>
      </Card>
    </div>
  )
}
