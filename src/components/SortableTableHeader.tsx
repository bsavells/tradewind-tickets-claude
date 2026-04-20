import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export type SortDir = 'asc' | 'desc'

interface SortableTableHeaderProps<K extends string> {
  /** The column key this header controls */
  columnKey: K
  /** Display text */
  label: string
  /** Current sort key from the parent */
  activeKey: K
  /** Current sort direction from the parent */
  activeDir: SortDir
  /** Called when the user clicks. The parent decides whether to switch key or toggle dir. */
  onSort: (key: K) => void
  /** Additional classes applied to the underlying TableHead (e.g. responsive visibility) */
  className?: string
  /** Text-align for the header content */
  align?: 'left' | 'right' | 'center'
}

/**
 * Clickable table header with a three-state arrow indicator:
 *   - inactive → faint two-way arrow (hint that it's sortable)
 *   - active ascending → up arrow in brand blue
 *   - active descending → down arrow in brand blue
 *
 * The parent owns the sort state; this is purely presentational.
 */
export function SortableTableHeader<K extends string>({
  columnKey,
  label,
  activeKey,
  activeDir,
  onSort,
  className,
  align = 'left',
}: SortableTableHeaderProps<K>) {
  const isActive = activeKey === columnKey
  const Icon = !isActive ? ArrowUpDown : activeDir === 'asc' ? ArrowUp : ArrowDown

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        aria-label={`Sort by ${label}${isActive ? ` (${activeDir})` : ''}`}
        className={cn(
          'inline-flex items-center gap-1 hover:text-[var(--color-tw-navy)] transition-colors group',
          align === 'right' && 'ml-auto',
          align === 'center' && 'mx-auto',
        )}
      >
        {label}
        <Icon
          className={cn(
            'h-3 w-3 transition-colors',
            isActive
              ? 'text-[var(--color-tw-blue)]'
              : 'text-muted-foreground/40 group-hover:text-muted-foreground',
          )}
        />
      </button>
    </TableHead>
  )
}
