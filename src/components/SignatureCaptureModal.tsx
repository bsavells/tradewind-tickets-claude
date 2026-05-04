import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useUploadSignature } from '@/hooks/useTicketSignature'
import { SignatureCaptureForm } from '@/components/SignatureCaptureForm'

interface SignatureCaptureModalProps {
  ticketId: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
  /** When provided, the form renders a Reason textarea pre-filled with this
   *  text — typically the auto-derived summary of what changed since the
   *  last signature. The user can edit it before submitting. */
  defaultReason?: string
}

export function SignatureCaptureModal({
  ticketId,
  open,
  onClose,
  onSuccess,
  defaultReason,
}: SignatureCaptureModalProps) {
  const uploadSignature = useUploadSignature()

  async function handleSign(signerName: string, blob: Blob, reason?: string) {
    await uploadSignature.mutateAsync({ ticketId, signerName, blob, reason })
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{defaultReason ? 'Re-sign Required' : 'Customer Signature'}</DialogTitle>
        </DialogHeader>
        <SignatureCaptureForm
          onSign={handleSign}
          onCancel={onClose}
          defaultReason={defaultReason}
        />
      </DialogContent>
    </Dialog>
  )
}
