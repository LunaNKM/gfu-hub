'use client'

import React from 'react'
import { clsx } from 'clsx'

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  hoverable?: boolean
}

export function Card({ children, className, onClick, hoverable = false }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-white rounded-xl border border-gray-200 shadow-sm',
        hoverable && 'cursor-pointer hover:shadow-md hover:border-gray-300 transition-all',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export default Card
