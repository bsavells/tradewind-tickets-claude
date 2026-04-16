import { useEffect, useRef, useState } from 'react'

declare const __BUILD_TIME__: string

const CURRENT_BUILD = __BUILD_TIME__
const POLL_INTERVAL = 60_000 // check every 60 seconds

export function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/version.json', {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        })
        if (!res.ok) return
        const { buildTime } = await res.json()
        if (buildTime && buildTime !== CURRENT_BUILD) {
          setUpdateAvailable(true)
        }
      } catch {
        // network error — ignore
      }
    }

    // Start polling after first interval (no need to check immediately on mount)
    intervalRef.current = setInterval(check, POLL_INTERVAL)

    // Also check on tab focus (user returns after being away)
    function onFocus() { check() }
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(intervalRef.current)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  function refresh() {
    window.location.reload()
  }

  return { updateAvailable, refresh }
}
