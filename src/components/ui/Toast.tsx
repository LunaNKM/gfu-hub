'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { clsx } from 'clsx'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={clsx(
              'flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg min-w-[280px] max-w-sm',
              'animate-in slide-in-from-right-5 duration-200',
              {
                'bg-green-50 border border-green-200': toast.type === 'success',
                'bg-red-50 border border-red-200': toast.type === 'error',
                'bg-blue-50 border border-blue-200': toast.type === 'info',
              }
            )}
          >
            {toast.type === 'success' && <CheckCircle size={18} className="text-green-600 shrink-0" />}
            {toast.type === 'error' && <AlertCircle size={18} className="text-red-600 shrink-0" />}
            {toast.type === 'info' && <Info size={18} className="text-blue-600 shrink-0" />}
            <span
              className={clsx('text-sm flex-1', {
                'text-green-800': toast.type === 'success',
                'text-red-800': toast.type === 'error',
                'text-blue-800': toast.type === 'info',
              })}
            >
              {toast.message}
            </span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-gray-400 hover:text-gray-600 shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

export default ToastProvider
