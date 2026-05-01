import { useEffect, useState } from 'react'

const DISMISS_KEY = 'pwa-install-dismissed-at'
// Don't re-prompt for 30 days after a dismissal.
const DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Chrome/Edge fire `beforeinstallprompt` with a custom event that exposes
 * `prompt()` and a `userChoice` promise. We hold the event so we can call
 * `prompt()` from a user-gesture handler later.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari uses a non-standard `navigator.standalone` flag.
  return (window.navigator as { standalone?: boolean }).standalone === true
}

function detectIOS(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  // iPad on iPadOS 13+ identifies as Macintosh; combine with touch points.
  return /iPad|iPhone|iPod/.test(ua)
    || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

function wasRecentlyDismissed(): boolean {
  if (typeof localStorage === 'undefined') return false
  const ts = localStorage.getItem(DISMISS_KEY)
  if (!ts) return false
  const dismissedAt = Number(ts)
  if (!Number.isFinite(dismissedAt)) return false
  return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS
}

/**
 * Tracks whether the app can be installed and exposes a `prompt()` to do so.
 *
 * The native install prompt only fires on Chromium-family browsers. For iOS
 * Safari we surface `isIOS: true` so the UI can show an "Add to Home Screen"
 * instruction instead.
 *
 * Suppresses itself when the app is already running standalone, or when the
 * user dismissed the prompt within the last 30 days.
 */
export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [dismissed, setDismissed] = useState(() => wasRecentlyDismissed())
  const standalone = isStandaloneMode()
  const ios = detectIOS()

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function prompt() {
    if (!deferred) return
    await deferred.prompt()
    const choice = await deferred.userChoice
    setDeferred(null)
    if (choice.outcome === 'dismissed') {
      dismiss()
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // localStorage can throw in private mode / quota errors — ignore.
    }
    setDismissed(true)
  }

  // Visible iff the app is installable AND not already installed AND not
  // recently dismissed. iOS gets the visible-without-deferred path.
  const visible = !standalone && !installed && !dismissed && (deferred != null || ios)

  return {
    visible,
    isIOS: ios,
    canPrompt: deferred != null,
    prompt,
    dismiss,
  }
}
