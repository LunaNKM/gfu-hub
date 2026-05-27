'use client'

import { useCallback, useEffect, useRef } from 'react'

type Patch = Record<string, unknown>

interface Options {
  delay?: number
  onSuccess?: (key: string) => void
  onError?: (key: string, error: unknown) => void
}

export function useDebouncedResourceSave(
  save: (key: string, patch: Patch) => Promise<void>,
  options: Options = {}
) {
  const delay = options.delay ?? 800
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const patches = useRef<Record<string, Patch>>({})
  const saveRef = useRef(save)
  const optionsRef = useRef(options)

  saveRef.current = save
  optionsRef.current = options

  const flush = useCallback(async (key: string) => {
    if (timers.current[key]) {
      clearTimeout(timers.current[key])
      delete timers.current[key]
    }

    const patch = patches.current[key]
    if (!patch) return
    delete patches.current[key]

    try {
      await saveRef.current(key, patch)
      optionsRef.current.onSuccess?.(key)
    } catch (error) {
      optionsRef.current.onError?.(key, error)
    }
  }, [])

  const schedule = useCallback(
    (key: string, patch: Patch) => {
      patches.current[key] = { ...(patches.current[key] ?? {}), ...patch }
      if (timers.current[key]) clearTimeout(timers.current[key])
      timers.current[key] = setTimeout(() => {
        void flush(key)
      }, delay)
    },
    [delay, flush]
  )

  useEffect(() => {
    const activeTimers = timers.current
    return () => {
      for (const key of Object.keys(activeTimers)) {
        clearTimeout(activeTimers[key])
      }
    }
  }, [])

  return { schedule, flush }
}
