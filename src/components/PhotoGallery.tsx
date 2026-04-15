import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, X, ImageIcon } from 'lucide-react'
import { useTicketPhotos, type TicketPhoto } from '@/hooks/useTicketPhotos'
import { cn } from '@/lib/utils'

interface PhotoGalleryProps {
  ticketId: string
}

export function PhotoGallery({ ticketId }: PhotoGalleryProps) {
  const { data: photos = [], isLoading } = useTicketPhotos(ticketId)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const open = lightboxIndex !== null
  const current = lightboxIndex !== null ? photos[lightboxIndex] : null

  const prev = useCallback(() => {
    setLightboxIndex(i => (i !== null ? (i - 1 + photos.length) % photos.length : null))
  }, [photos.length])

  const next = useCallback(() => {
    setLightboxIndex(i => (i !== null ? (i + 1) % photos.length : null))
  }, [photos.length])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, prev, next])

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <ImageIcon className="h-4 w-4" />
        No photos attached
      </div>
    )
  }

  return (
    <>
      {/* Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {photos.map((photo, idx) => (
          <PhotoThumb
            key={photo.id}
            photo={photo}
            onClick={() => setLightboxIndex(idx)}
          />
        ))}
      </div>

      {/* Lightbox */}
      <Dialog open={open} onOpenChange={v => { if (!v) setLightboxIndex(null) }}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-black border-0">
          <div className="relative flex flex-col">
            {/* Close + counter */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-3">
              <span className="text-white/70 text-sm">
                {lightboxIndex !== null ? lightboxIndex + 1 : 0} / {photos.length}
              </span>
              <button
                onClick={() => setLightboxIndex(null)}
                className="text-white/70 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Image */}
            <div className="flex items-center justify-center min-h-[50vh] max-h-[70vh] bg-black">
              {current?.signedUrl ? (
                <img
                  src={current.signedUrl}
                  alt={current.caption ?? 'Ticket photo'}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              ) : (
                <div className="flex items-center justify-center w-full h-64">
                  <ImageIcon className="h-12 w-12 text-white/20" />
                </div>
              )}
            </div>

            {/* Caption + nav */}
            <div className="bg-black/90 px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                {current?.caption ? (
                  <p className="text-white/90 text-sm truncate">{current.caption}</p>
                ) : (
                  <p className="text-white/30 text-sm italic">No caption</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={prev}
                  disabled={photos.length <= 1}
                  className="text-white/70 hover:text-white disabled:opacity-30 transition-colors p-1"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={next}
                  disabled={photos.length <= 1}
                  className="text-white/70 hover:text-white disabled:opacity-30 transition-colors p-1"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function PhotoThumb({ photo, onClick }: { photo: TicketPhoto; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-square rounded-md overflow-hidden bg-muted group focus-visible:ring-2 focus-visible:ring-primary"
    >
      {photo.signedUrl ? (
        <img
          src={photo.signedUrl}
          alt={photo.caption ?? 'Ticket photo'}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
        </div>
      )}
      {photo.caption && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1">
          <p className="text-white text-[10px] truncate">{photo.caption}</p>
        </div>
      )}
    </button>
  )
}

// Re-export for use in read-only contexts that import from this file
export type { TicketPhoto }
export { cn }
