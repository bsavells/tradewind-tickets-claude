import { useState, useCallback } from 'react'
import type { SortDir } from '@/components/SortableTableHeader'

/**
 * Lightweight table-sort state hook.
 *
 * Click the same column → toggle asc/desc.
 * Click a different column → switch to that column, ascending.
 */
export function useTableSort<K extends string>(defaultKey: K, defaultDir: SortDir = 'asc') {
  const [sortKey, setSortKey] = useState<K>(defaultKey)
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir)

  const handleSort = useCallback((key: K) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDir('asc')
      return key
    })
  }, [])

  return { sortKey, sortDir, handleSort }
}

/** Case-insensitive string compare that treats null/undefined as empty. */
export function cmpString(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base' })
}

/** Numeric compare that treats null/undefined as 0. */
export function cmpNumber(a: number | null | undefined, b: number | null | undefined): number {
  return (a ?? 0) - (b ?? 0)
}

/** Boolean compare — true sorts before false in ascending order. */
export function cmpBool(a: boolean | null | undefined, b: boolean | null | undefined): number {
  return (a ? 0 : 1) - (b ? 0 : 1)
}
