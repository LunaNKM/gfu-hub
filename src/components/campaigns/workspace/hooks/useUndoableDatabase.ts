'use client'

import { useCallback, useEffect, useRef } from 'react'
import { CampaignCellValue } from '@/types'

const MAX_STACK = 50

interface Command {
  undo: () => void
}

/**
 * 셀 변경에 대한 Undo/Redo를 제공합니다.
 *
 * Usage:
 *   const { wrap, undo } = useUndoableDatabase(databaseId)
 *   const handleCellChange = wrap((rowId, colId, value) => onCellChange(rowId, colId, value))
 *
 * Cmd+Z / Ctrl+Z: undo 호출
 */
export function useUndoableDatabase(
  databaseId: string,
  onCellChange: (rowId: string, colId: string, value: CampaignCellValue) => void,
  getCurrentValue: (rowId: string, colId: string) => CampaignCellValue
) {
  const stackRef = useRef<Command[]>([])

  // databaseId가 바뀌면 스택 초기화
  useEffect(() => {
    stackRef.current = []
  }, [databaseId])

  const push = useCallback((command: Command) => {
    stackRef.current = [...stackRef.current.slice(-MAX_STACK + 1), command]
  }, [])

  const undo = useCallback(() => {
    const stack = stackRef.current
    if (stack.length === 0) return
    const last = stack[stack.length - 1]
    stackRef.current = stack.slice(0, -1)
    last.undo()
  }, [])

  // Cmd+Z / Ctrl+Z 전역 리스너
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo])

  /**
   * onCellChange를 wrapping해서 변경 전 값을 저장하고 undo 스택에 push합니다.
   */
  const wrappedCellChange = useCallback(
    (rowId: string, colId: string, value: CampaignCellValue) => {
      const prev = getCurrentValue(rowId, colId)
      onCellChange(rowId, colId, value)
      push({
        undo: () => onCellChange(rowId, colId, prev),
      })
    },
    [onCellChange, getCurrentValue, push]
  )

  return { wrappedCellChange, undo }
}
