import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string   // e.g. "All customers"
  label?: string         // aria/label
  className?: string
  searchable?: boolean
  maxChips?: number      // how many chips to show before collapsing to "N selected"
}

/**
 * Compact multi-select. Click the trigger to open a panel of checkbox options.
 * Closes on outside click or ESC.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'All',
  label,
  className,
  searchable = true,
  maxChips = 2,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selectedSet = new Set(value)
  const filtered = searchable && query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  function toggle(v: string) {
    if (selectedSet.has(v)) onChange(value.filter(x => x !== v))
    else onChange([...value, v])
  }

  const selectedOptions = options.filter(o => selectedSet.has(o.value))
  const extra = selectedOptions.length - maxChips

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'w-full min-h-9 flex items-center gap-1.5 justify-between rounded-md border bg-card px-2.5 py-1.5 text-sm',
          'hover:border-[var(--color-tw-blue)]/50 transition-colors',
          open && 'border-[var(--color-tw-blue)] ring-2 ring-[var(--color-tw-blue)]/20',
        )}
      >
        <div className="flex flex-wrap items-center gap-1 min-w-0">
          {selectedOptions.length === 0 ? (
            <span className="text-muted-foreground truncate">{placeholder}</span>
          ) : (
            <>
              {selectedOptions.slice(0, maxChips).map(o => (
                <span
                  key={o.value}
                  className="inline-flex items-center gap-1 rounded bg-[var(--color-tw-mist)] px-1.5 py-0.5 text-xs text-[var(--color-tw-navy)]"
                >
                  <span className="max-w-[120px] truncate">{o.label}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); toggle(o.value) }}
                    className="text-[var(--color-tw-navy)]/50 hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </span>
              ))}
              {extra > 0 && (
                <span className="text-xs text-muted-foreground">+{extra} more</span>
              )}
            </>
          )}
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 z-30 rounded-md border bg-card shadow-lg max-h-72 overflow-hidden flex flex-col">
          {searchable && (
            <div className="p-1.5 border-b">
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full rounded px-2 py-1 text-sm bg-transparent focus:outline-none"
              />
            </div>
          )}
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs border-b bg-[var(--color-tw-mist)]/40">
            <button
              type="button"
              onClick={() => onChange(options.map(o => o.value))}
              className="text-[var(--color-tw-blue)] hover:underline font-medium"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-muted-foreground hover:text-destructive"
            >
              Clear
            </button>
          </div>
          <ul role="listbox" className="overflow-y-auto flex-1 py-1">
            {filtered.length === 0 ? (
              <li className="px-2.5 py-2 text-xs text-muted-foreground italic">No results</li>
            ) : (
              filtered.map(o => {
                const checked = selectedSet.has(o.value)
                return (
                  <li
                    key={o.value}
                    onClick={() => toggle(o.value)}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-1.5 text-sm cursor-pointer',
                      'hover:bg-[var(--color-tw-mist)]/70 transition-colors',
                      checked && 'bg-[var(--color-tw-mist)]',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        checked
                          ? 'bg-[var(--color-tw-blue)] border-[var(--color-tw-blue)] text-white'
                          : 'border-muted-foreground/30 bg-background',
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1 truncate">{o.label}</span>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
