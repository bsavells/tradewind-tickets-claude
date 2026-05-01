import { Download, Share, X } from 'lucide-react'
import { usePwaInstall } from '@/hooks/usePwaInstall'

/**
 * Bottom-of-screen banner inviting the user to install the app as a PWA.
 *
 * Two variants:
 * - Chromium (canPrompt): clicking "Install" triggers the native prompt.
 * - iOS Safari (isIOS && !canPrompt): shows manual instructions because
 *   iOS doesn't expose `beforeinstallprompt`.
 *
 * Suppresses itself when the app is already standalone, after install, and
 * for 30 days after a user dismissal (see usePwaInstall).
 */
export function InstallBanner() {
  const { visible, isIOS, canPrompt, prompt, dismiss } = usePwaInstall()

  if (!visible) return null

  // Sit above the UpdateBanner so they don't overlap if both appear at once.
  const wrapperClass =
    'fixed bottom-20 left-1/2 -translate-x-1/2 z-40 ' +
    'animate-in slide-in-from-bottom-4 fade-in duration-300 ' +
    'max-w-[calc(100vw-2rem)]'

  if (canPrompt) {
    return (
      <div className={wrapperClass}>
        <div className="flex items-center gap-3 rounded-lg border bg-background px-4 py-2.5 shadow-lg">
          <Download className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm">Install Tradewind Tickets for faster access.</span>
          <button
            onClick={prompt}
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Install
          </button>
          <button
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // iOS path — manual install instructions.
  if (isIOS) {
    return (
      <div className={wrapperClass}>
        <div className="flex items-center gap-3 rounded-lg border bg-background px-4 py-2.5 shadow-lg">
          <Share className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm">
            To install: tap <Share className="inline h-3.5 w-3.5 -mt-0.5" /> then "Add to Home Screen".
          </span>
          <button
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return null
}
