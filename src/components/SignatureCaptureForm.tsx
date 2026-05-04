import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertCircle } from 'lucide-react'
import { SignaturePad, type SignaturePadRef } from '@/components/SignaturePad'

interface SignatureCaptureFormProps {
  /** Called with the typed name, PNG blob, and (optional) re-sign reason when the user clicks Submit. Should throw on failure. */
  onSign: (signerName: string, blob: Blob, reason?: string) => Promise<void>
  onCancel?: () => void
  showCancel?: boolean
  submitLabel?: string
  /** When set, render the Reason field pre-populated. Typically the auto-derived
   *  summary of what changed since the last signature; the user can override. */
  defaultReason?: string
}

export function SignatureCaptureForm({
  onSign,
  onCancel,
  showCancel = true,
  submitLabel = 'Submit Signature',
  defaultReason,
}: SignatureCaptureFormProps) {
  const [signerName, setSignerName] = useState('')
  const [reason, setReason] = useState(defaultReason ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const padRef = useRef<SignaturePadRef>(null)

  // Sync the reason field if the parent's defaultReason loads after mount
  // (the audit-log fetch is async).
  useEffect(() => {
    if (defaultReason !== undefined) setReason(defaultReason)
  }, [defaultReason])

  async function handleSubmit() {
    setError(null)
    if (!signerName.trim()) {
      setError('Please enter your full name.')
      return
    }
    if (padRef.current?.isEmpty()) {
      setError('Please draw your signature in the box below.')
      return
    }
    setSubmitting(true)
    try {
      const blob = await padRef.current!.toBlob()
      await onSign(signerName.trim(), blob, reason.trim() || undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save signature. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Signature</Label>
        {/* Pad comes first so the keyboard is dismissed before signing on mobile */}
        <div onPointerDown={() => {
          // Blur any focused input to dismiss the mobile keyboard
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        }}>
          <SignaturePad ref={padRef} />
        </div>
        <button
          type="button"
          onClick={() => padRef.current?.clear()}
          disabled={submitting}
          className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signer-name">Full Name</Label>
        <Input
          id="signer-name"
          value={signerName}
          onChange={e => setSignerName(e.target.value)}
          placeholder="e.g. Jane Smith"
          disabled={submitting}
          autoComplete="name"
        />
      </div>

      {defaultReason !== undefined && (
        <div className="space-y-1.5">
          <Label htmlFor="resign-reason">Reason for re-signing</Label>
          <Textarea
            id="resign-reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Auto-filled from recent ticket changes. Edit if needed."
            disabled={submitting}
            rows={2}
          />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        {showCancel && onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </div>
  )
}
