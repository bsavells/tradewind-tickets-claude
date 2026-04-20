/**
 * Tradewind brand primitives — logo mark, wordmark, and gradient accent bar.
 *
 * Design: three angled bars forming an abstract wind/arrow motif, rendered in
 * the signature navy → cyan → blue gradient. Matches the geometric treatment
 * used on tradewind.groupm7.io and in the branded email templates.
 */
import { cn } from '@/lib/utils'

/**
 * Geometric logo mark. Three stacked, angled bars with a gradient fill.
 * Scales cleanly via the `size` prop (pixels) or by overriding `className`.
 */
export function TradewindLogo({
  size = 32,
  className,
  mono = false,
}: {
  size?: number
  className?: string
  /** Render in a single flat color (current text color) for monochrome contexts */
  mono?: boolean
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="tw-logo-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0a1e3d" />
          <stop offset="55%" stopColor="#00d4ff" />
          <stop offset="100%" stopColor="#1d90ff" />
        </linearGradient>
        <linearGradient id="tw-logo-grad-2" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1d90ff" />
          <stop offset="100%" stopColor="#0a1e3d" />
        </linearGradient>
      </defs>

      {/* Three parallel angled bars forming a wind / forward-motion motif */}
      {/* Top bar — shortest */}
      <path
        d="M14 6 L34 6 L26 14 L6 14 Z"
        fill={mono ? 'currentColor' : 'url(#tw-logo-grad)'}
      />
      {/* Middle bar — widest, anchored */}
      <path
        d="M8 18 L36 18 L28 26 L0 26 Z"
        fill={mono ? 'currentColor' : 'url(#tw-logo-grad-2)'}
      />
      {/* Bottom bar — short, offset */}
      <path
        d="M18 30 L38 30 L30 38 L10 38 Z"
        fill={mono ? 'currentColor' : 'url(#tw-logo-grad)'}
      />
    </svg>
  )
}

/**
 * Full wordmark: logo + "TRADEWIND · TICKETS" text treatment.
 * Used in the AppShell sidebar and on auth pages.
 */
export function Wordmark({
  size = 'md',
  orientation = 'horizontal',
  showTagline = false,
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  orientation?: 'horizontal' | 'vertical'
  showTagline?: boolean
  className?: string
}) {
  const logoSize = size === 'sm' ? 22 : size === 'md' ? 32 : 44
  const textSize = size === 'sm' ? 'text-sm' : size === 'md' ? 'text-base' : 'text-xl'
  const taglineSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]'

  const isVertical = orientation === 'vertical'

  return (
    <div
      className={cn(
        'inline-flex items-center',
        isVertical ? 'flex-col gap-3' : 'gap-2.5',
        className,
      )}
    >
      <TradewindLogo size={logoSize} />
      <div className={cn('flex flex-col', isVertical && 'items-center')}>
        <div className={cn('tw-wordmark leading-none flex items-baseline gap-1', textSize)}>
          <span className="font-extrabold text-[var(--color-tw-navy)]">TRADEWIND</span>
          <span className="text-[var(--color-tw-blue)] font-light opacity-60 text-[0.7em] mx-0.5">·</span>
          <span className="font-light text-[var(--color-tw-blue)]">TICKETS</span>
        </div>
        {showTagline && (
          <p className={cn(
            'tw-label mt-1.5 text-[var(--color-tw-blue)] opacity-80',
            taglineSize,
          )}>
            Efficiency&ensp;—&ensp;Solved.
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Signature gradient accent bar. 3px navy → cyan → blue.
 * Drop this at the top of pages or cards for a brand moment.
 */
export function GradientBar({
  className,
  thickness = 3,
}: {
  className?: string
  thickness?: number
}) {
  return (
    <div
      className={cn('tw-gradient-bar w-full', className)}
      style={{ height: thickness }}
      aria-hidden="true"
    />
  )
}
