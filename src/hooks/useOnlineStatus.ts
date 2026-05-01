import { useEffect, useState } from 'react'

/**
 * Tracks browser online/offline state.
 *
 * `navigator.onLine` is best-effort — it reports network adapter state, not
 * actual reachability — so consumers should still treat fetch failures as
 * "offline" too. We pair this with the sync queue's network-error
 * classification to recover from cases where the OS thinks it's online but
 * the connection is dead.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    function on() { setOnline(true) }
    function off() { setOnline(false) }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return online
}
