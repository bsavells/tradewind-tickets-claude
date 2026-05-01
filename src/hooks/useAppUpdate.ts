import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Update detection backed by the service worker.
 *
 * When a new build is deployed, the SW that vite-plugin-pwa registers picks
 * up the new asset manifest, installs it as the "waiting" worker, and fires
 * `onNeedRefresh`. We surface that as `updateAvailable` so the existing
 * UpdateBanner can show its "A new version is available" prompt.
 *
 * Calling `refresh()` invokes `updateServiceWorker(true)` which sends
 * `skipWaiting` to the new worker and reloads the page so the user
 * actually runs the new bundle.
 *
 * In dev the SW is disabled (see vite.config `devOptions.enabled: false`),
 * so the hook resolves to a permanent `updateAvailable: false`.
 */
export function useAppUpdate() {
  const {
    needRefresh: [updateAvailable],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      // Surface SW registration failures in the console for debugging but
      // don't crash the app — fall back to the no-update path.
      console.warn('[pwa] SW registration failed:', error)
    },
  })

  function refresh() {
    // `true` = reload after the new SW takes over.
    void updateServiceWorker(true)
  }

  return { updateAvailable, refresh }
}
