'use client'

import React from 'react'
import { BarChart2 } from 'lucide-react'

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full py-24">
      <BarChart2 size={56} className="text-gray-200 mb-4" />
      <h1 className="text-xl font-semibold text-gray-700 mb-2">대시보드 준비 중</h1>
      <p className="text-sm text-gray-400 text-center max-w-sm">
        Meta 광고 데이터, 성과 분석 등 다양한 인사이트를 제공할 예정입니다.
      </p>
    </div>
  )
}
