import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Package } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useCatalogItemsTechview, type CatalogItemTech } from '@/hooks/useCatalog'

const RESULT_CAP = 50

interface CatalogItemPickerProps {
  open: boolean
  onClose: () => void
  /** Called with the selected item when the user clicks a row. */
  onPick: (item: CatalogItemTech) => void
}

/**
 * Typeahead picker over the tech-safe catalog view. Used by the ticket form
 * materials section so techs can pick a known SKU instead of retyping part
 * numbers + descriptions for every row.
 *
 * Reads from `catalog_items_techview` which omits unit_cost + markup_pct,
 * so price information never leaks to a non-admin user.
 *
 * Search is client-side: ~500 items is small enough that an in-memory filter
 * is fast and avoids round-trips on every keystroke. Results are capped at
 * 50 rows to keep the dropdown tidy.
 */
export function CatalogItemPicker({ open, onClose, onPick }: CatalogItemPickerProps) {
  const { data: items = [], isLoading } = useCatalogItemsTechview({ activeOnly: true })
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset search every time the picker is reopened so the user starts fresh.
  useEffect(() => {
    if (open) {
      setSearch('')
      // Defer focus until after the dialog's open animation lands.
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) {
      // Show first N items alphabetically by vendor when no search — gives the
      // user something to scroll through rather than an empty list.
      return [...items]
        .sort((a, b) => {
          const v = (a.vendor_name ?? '').localeCompare(b.vendor_name ?? '')
          if (v !== 0) return v
          return (a.part_number ?? '').localeCompare(b.part_number ?? '')
        })
        .slice(0, RESULT_CAP)
    }
    const matches: CatalogItemTech[] = []
    for (const item of items) {
      const haystack = `${item.vendor_name ?? ''} ${item.part_number ?? ''} ${item.description ?? ''}`.toLowerCase()
      if (haystack.includes(q)) {
        matches.push(item)
        if (matches.length >= RESULT_CAP) break
      }
    }
    return matches
  }, [items, search])

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" /> Pick a Catalog Item
          </DialogTitle>
          <DialogDescription>
            Search by vendor, part number, or description.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="e.g. RTU, EYS116, fuse"
              className="pl-8"
            />
          </div>

          <div className="max-h-[55vh] overflow-y-auto -mx-1 px-1">
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading catalog…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Catalog is empty. Ask an admin to add items in Settings → Catalog.
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No matches for "{search}".
              </p>
            ) : (
              <ul className="divide-y">
                {filtered.map(item => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => { onPick(item); onClose() }}
                      className="w-full text-left px-2 py-2 hover:bg-muted/60 focus:bg-muted/60 focus:outline-none rounded-sm transition-colors"
                    >
                      <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                        <span>{item.vendor_name}</span>
                        {item.part_number && (
                          <span className="font-mono">{item.part_number}</span>
                        )}
                        {item.size && <span>· {item.size}</span>}
                      </div>
                      <div className="text-sm">
                        {item.description || <span className="text-muted-foreground italic">No description</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {filtered.length === RESULT_CAP && (
              <p className="text-[11px] text-muted-foreground py-2 text-center">
                Showing first {RESULT_CAP} matches — refine your search to see more.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
