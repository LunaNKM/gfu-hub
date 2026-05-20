'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  MessageSquare,
  AppWindow,
  BarChart2,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react'
import { clsx } from 'clsx'

const navItems = [
  { href: '/', label: '홈', icon: Home },
  { href: '/chat', label: 'AI 채팅', icon: MessageSquare },
  { href: '/apps', label: '앱 런처', icon: AppWindow },
  { href: '/analytics', label: '애널리틱스', icon: BarChart2 },
  { href: '/usage', label: 'AI 사용량', icon: Zap },
  { href: '/settings', label: '설정', icon: Settings },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  return (
    <aside
      className={clsx(
        'flex flex-col h-screen bg-[#f8f9fa] border-r border-gray-200 transition-all duration-200 shrink-0',
        collapsed ? 'w-14' : 'w-56'
      )}
    >
      {/* 로고 */}
      <div className="flex items-center h-14 px-3 border-b border-gray-200">
        {!collapsed && (
          <span className="text-base font-bold text-gray-900 truncate">GFU Hub</span>
        )}
        {collapsed && <span className="text-base font-bold text-gray-900 mx-auto">G</span>}
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 mx-2 px-2.5 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* 접기 버튼 */}
      <div className="border-t border-gray-200 p-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
