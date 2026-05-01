import { useEffect } from 'react'

const APP_NAME = 'Tradewind Tickets'

/**
 * Sets `document.title` for the current page so screen readers and the
 * browser tab label both announce where the user is.
 *
 * Pass `null` / `undefined` to fall back to the bare app name.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
    return () => {
      // Restore the bare app name on unmount so a stale page title doesn't
      // linger if the next page forgets to set its own.
      document.title = APP_NAME
    }
  }, [title])
}
