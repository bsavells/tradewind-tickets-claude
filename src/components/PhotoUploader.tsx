import { useRef, useState, useCallback, useEffect } from 'react'
import { Upload, Camera, Trash2, ImageIcon, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useTicketPhotos,
  useUploadPhoto,
  useDeletePhoto,
  useUpdatePhotoCaption,
  MAX_TICKET_PHOTOS,
  type TicketPhoto,
} from '@/hooks/useTicketPhotos'
import { PhotoGallery } from '@/components/PhotoGallery'

interface PhotoUploaderProps {
  ticketId: string | undefined
  canEdit: boolean
  onAutoSave: () => Promise<string>
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export function PhotoUploader({ ticketId, canEdit, onAutoSave }: PhotoUploaderProps) {
  // Read-only mode: render gallery directly
  if (!canEdit) {
    if (!ticketId) return null
    return <PhotoGallery ticketId={ticketId} />
  }

  return <PhotoUploaderInner ticketId={ticketId} onAutoSave={onAutoSave} />
}

function PhotoUploaderInner({
  ticketId,
  onAutoSave,
}: {
  ticketId: string | undefined
  onAutoSave: () => Promise<string>
}) {
  const { data: photos = [], isLoading } = useTicketPhotos(ticketId)
  const uploadPhoto = useUploadPhoto()
  const deletePhoto = useDeletePhoto()
  const updateCaption = useUpdatePhotoCaption()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pendingPreview, setPendingPreview] = useState<{ name: string; url: string } | null>(null)
  const [captionErrors, setCaptionErrors] = useState<Record<string, string>>({})
  const previewRef = useRef<HTMLDivElement>(null)

  // cameraPending persists in sessionStorage so it survives the browser
  // freezing/suspending the page while the native camera app is open.
  const CAMERA_KEY = 'tw-camera-pending'
  const [cameraPending, setCameraPendingState] = useState(
    () => sessionStorage.getItem(CAMERA_KEY) === '1'
  )
  function setCameraPending(v: boolean) {
    setCameraPendingState(v)
    if (v) sessionStorage.setItem(CAMERA_KEY, '1')
    else sessionStorage.removeItem(CAMERA_KEY)
  }

  // When the page resumes from the camera app, restore the pending state
  // from sessionStorage (React state may have been lost during suspend).
  // Don't auto-clear on a timer — the file can take 30+ seconds to arrive
  // on mobile. It clears naturally when handleFiles runs or photos change.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      if (sessionStorage.getItem(CAMERA_KEY) === '1') {
        setCameraPendingState(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  // Clear cameraPending when photos array changes (upload completed and query refreshed)
  const prevPhotoCount = useRef(photos.length)
  useEffect(() => {
    if (photos.length > prevPhotoCount.current) {
      setCameraPending(false)
    }
    prevPhotoCount.current = photos.length
  }, [photos.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const atLimit = photos.length >= MAX_TICKET_PHOTOS

  async function resolveTicketId(): Promise<string | null> {
    if (ticketId) return ticketId
    try {
      return await onAutoSave()
    } catch {
      setUploadError('Failed to save draft before uploading. Please try saving the form first.')
      return null
    }
  }

  function validateFile(file: File): string | null {
    if (!file.type.startsWith('image/')) return 'Only image files are accepted.'
    if (file.size > MAX_FILE_SIZE) {
      const mb = (file.size / 1024 / 1024).toFixed(1)
      return `${file.name} is too large (${mb} MB — max 10 MB).`
    }
    return null
  }

  async function handleFiles(files: FileList | File[]) {
    setUploadError(null)
    const fileArr = Array.from(files)
    if (fileArr.length === 0) return

    const file = fileArr[0] // one at a time
    const validationError = validateFile(file)
    if (validationError) {
      setUploadError(validationError)
      return
    }

    if (photos.length >= MAX_TICKET_PHOTOS) {
      setUploadError(`Maximum ${MAX_TICKET_PHOTOS} photos allowed.`)
      return
    }

    // Show preview immediately — before resolveTicketId which may autosave
    const previewUrl = URL.createObjectURL(file)
    setCameraPending(false)
    setPendingPreview({ name: file.name || 'Photo', url: previewUrl })
    setUploading(true)
    // Scroll the preview into view after render
    setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)

    const tid = await resolveTicketId()
    if (!tid) {
      setUploading(false)
      setPendingPreview(null)
      URL.revokeObjectURL(previewUrl)
      return
    }

    try {
      const result = await uploadPhoto.mutateAsync({ ticketId: tid, file })
      if ('queued' in result) {
        setUploadError("You're offline — photo queued and will upload when reconnected.")
      }
    } catch {
      setUploadError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      setPendingPreview(null)
      URL.revokeObjectURL(previewUrl)
      // Reset file inputs so the same file can be re-selected after an error
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    }
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      handleFiles(e.dataTransfer.files)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [photos.length, ticketId]
  )

  async function handleDelete(photo: TicketPhoto) {
    try {
      await deletePhoto.mutateAsync({
        photoId: photo.id,
        ticketId: photo.ticket_id,
        filePath: photo.file_url,
      })
    } catch {
      // Deletion failure is rare; the list will refresh on next query invalidation
    }
  }

  async function handleCaptionBlur(photo: TicketPhoto, value: string) {
    if (value === (photo.caption ?? '')) return // no change
    try {
      await updateCaption.mutateAsync({
        photoId: photo.id,
        ticketId: photo.ticket_id,
        caption: value,
      })
      setCaptionErrors(prev => ({ ...prev, [photo.id]: '' }))
    } catch {
      setCaptionErrors(prev => ({ ...prev, [photo.id]: 'Failed to save caption.' }))
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Drop zone — hidden when at limit */}
      {!atLimit && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer',
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/30'
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Uploading…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Upload className="h-6 w-6 opacity-50" />
              <p className="text-sm">Drag & drop or tap to upload</p>
              <p className="text-xs text-muted-foreground/60">JPEG, PNG, HEIC · Max 10 MB each</p>
            </div>
          )}
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => e.target.files && handleFiles(e.target.files)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          if (e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files)
          } else {
            // User cancelled the camera — clear pending state
            setCameraPending(false)
          }
        }}
      />

      {/* Action buttons */}
      {!atLimit && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 flex-1"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Choose File
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 flex-1"
            onClick={() => { setCameraPending(true); cameraInputRef.current?.click() }}
            disabled={uploading || cameraPending}
          >
            <Camera className="h-3.5 w-3.5" />
            Camera
          </Button>
        </div>
      )}

      {/* Photo count */}
      <p className={cn(
        'text-xs',
        atLimit ? 'text-amber-600 font-medium' : 'text-muted-foreground'
      )}>
        {photos.length} / {MAX_TICKET_PHOTOS} photos
        {atLimit && ' — limit reached'}
      </p>

      {/* Upload error */}
      {uploadError && (
        <div className="flex items-start gap-2 text-destructive text-xs">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {uploadError}
        </div>
      )}

      {/* Camera pending — shown instantly when Camera is tapped, before file is available */}
      {cameraPending && !pendingPreview && (
        <div ref={previewRef} className="flex gap-3 items-center p-3 rounded-lg border border-primary/30 bg-primary/5 animate-pulse">
          <div className="w-14 h-14 rounded-md bg-muted shrink-0 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Processing photo…</p>
            <p className="text-xs text-muted-foreground">This may take a moment</p>
          </div>
        </div>
      )}

      {/* Uploading preview — shown once file is available with local thumbnail */}
      {pendingPreview && (
        <div ref={previewRef} className="flex gap-3 items-center p-3 rounded-lg border border-primary/30 bg-primary/5 animate-pulse">
          <div className="w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0 relative">
            <img
              src={pendingPreview.url}
              alt="Uploading"
              className="w-full h-full object-cover opacity-60"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{pendingPreview.name}</p>
            <p className="text-xs text-muted-foreground">Uploading…</p>
          </div>
        </div>
      )}

      {/* Photo list */}
      {photos.length > 0 && (
        <div className="space-y-2">
          {photos.map(photo => (
            <PhotoRow
              key={photo.id}
              photo={photo}
              onDelete={() => handleDelete(photo)}
              onCaptionBlur={v => handleCaptionBlur(photo, v)}
              captionError={captionErrors[photo.id]}
              deleting={deletePhoto.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PhotoRow({
  photo,
  onDelete,
  onCaptionBlur,
  captionError,
  deleting,
}: {
  photo: TicketPhoto
  onDelete: () => void
  onCaptionBlur: (value: string) => void
  captionError?: string
  deleting: boolean
}) {
  const [caption, setCaption] = useState(photo.caption ?? '')

  return (
    <div className="flex gap-3 items-start p-3 rounded-lg border bg-muted/30">
      {/* Thumbnail */}
      <div className="w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0">
        {photo.signedUrl ? (
          <img
            src={photo.signedUrl}
            alt={photo.caption ?? 'Photo'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Caption field */}
      <div className="flex-1 min-w-0 space-y-1">
        <label className="text-xs text-muted-foreground">Caption (optional)</label>
        <input
          type="text"
          value={caption}
          onChange={e => setCaption(e.target.value)}
          onBlur={e => onCaptionBlur(e.target.value)}
          placeholder="e.g. Before repair"
          className={cn(
            'w-full text-sm bg-background border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary',
            captionError ? 'border-destructive' : 'border-border'
          )}
        />
        {captionError && (
          <p className="text-xs text-destructive">{captionError}</p>
        )}
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="text-muted-foreground hover:text-destructive transition-colors mt-1 shrink-0 disabled:opacity-40"
        title="Remove photo"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
