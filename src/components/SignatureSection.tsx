import { useState } from 'react'
import { PenLine, Mail, AlertCircle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTicketSignature, useRequestSignatureToken, useClearSignature } from '@/hooks/useTicketSignature'
import { SignatureCaptureModal } from '@/components/SignatureCaptureModal'
import { SignatureDisplay } from '@/components/SignatureDisplay'

interface SignatureSectionProps {
  ticketId: string
  canEdit: boolean
}

export function SignatureSection({ ticketId, canEdit }: SignatureSectionProps) {
  const { data: signature, isLoading } = useTicketSignature(ticketId)
  const requestToken = useRequestSignatureToken()
  const clearSignature = useClearSignature()

  const [captureOpen, setCaptureOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [requestError, setRequestError] = useState<string | null>(null)
  const [requestSent, setRequestSent] = useState(false)

  async function handleRequestSignature() {
    setRequestError(null)
    if (!email.trim() || !email.includes('@')) {
      setRequestError('Please enter a valid email address.')
      return
    }
    try {
      await requestToken.mutateAsync({ ticketId, customerEmail: email.trim() })
      setRequestSent(true)
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to send request.')
    }
  }

  function handleRequestClose() {
    setRequestOpen(false)
    setEmail('')
    setRequestError(null)
    setRequestSent(false)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (signature) {
    return (
      <div className="space-y-2">
        <SignatureDisplay signature={signature} />
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-destructive"
            onClick={() => setClearOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear &amp; re-sign
          </Button>
        )}

        {/* Clear confirm dialog */}
        <Dialog open={clearOpen} onOpenChange={setClearOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Clear Signature</DialogTitle>
              <DialogDescription>
                This will remove the current signature. You can then collect a new one on-site or request one via email.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setClearOpen(false)} disabled={clearSignature.isPending}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={clearSignature.isPending}
                onClick={async () => {
                  await clearSignature.mutateAsync({ ticketId })
                  setClearOpen(false)
                }}
              >
                {clearSignature.isPending ? 'Clearing…' : 'Clear Signature'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  if (!canEdit) {
    return (
      <p className="text-sm text-muted-foreground italic">No signature collected</p>
    )
  }

  return (
    <>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 flex-1"
          onClick={() => setCaptureOpen(true)}
        >
          <PenLine className="h-3.5 w-3.5" />
          Get Signature
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 flex-1"
          onClick={() => setRequestOpen(true)}
        >
          <Mail className="h-3.5 w-3.5" />
          Request via Email
        </Button>
      </div>

      <SignatureCaptureModal
        ticketId={ticketId}
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onSuccess={() => setCaptureOpen(false)}
      />

      {/* Request signature dialog */}
      <Dialog open={requestOpen} onOpenChange={v => { if (!v) handleRequestClose() }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Request Signature via Email</DialogTitle>
          </DialogHeader>
          {requestSent ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Signature request sent to{' '}
                <span className="font-medium">{email}</span>. The link expires in 48 hours.
              </p>
              <DialogFooter>
                <Button onClick={handleRequestClose}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="customer-email">Customer Email</Label>
                <Input
                  id="customer-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="customer@example.com"
                  disabled={requestToken.isPending}
                  onKeyDown={e => { if (e.key === 'Enter') handleRequestSignature() }}
                />
              </div>
              {requestError && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {requestError}
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={handleRequestClose}
                  disabled={requestToken.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRequestSignature}
                  disabled={requestToken.isPending}
                >
                  {requestToken.isPending ? 'Sending…' : 'Send Request'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
