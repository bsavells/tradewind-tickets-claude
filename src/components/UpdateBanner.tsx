import { RefreshCw } from 'lucide-react'
import { useAppUpdate } from '@/hooks/useAppUpdate'

export function UpdateBanner() {
  const { updateAvailable, refresh } = useAppUpdate()

  if (!updateAvailable) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 rounded-lg bg-primary px-4 py-2.5 text-primary-foreground shadow-lg">
        <span className="text-sm font-medium">A new version is available</span>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-md bg-primary-foreground/20 px-3 py-1 text-xs font-semibold hover:bg-primary-foreground/30 transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>
    </div>
  )
}
