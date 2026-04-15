import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useUploadSignature } from '@/hooks/useTicketSignature'
import { SignatureCaptureForm } from '@/components/SignatureCaptureForm'

interface SignatureCaptureModalProps {
  ticketId: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function SignatureCaptureModal({
  ticketId,
  open,
  onClose,
  onSuccess,
}: SignatureCaptureModalProps) {
  const uploadSignature = useUploadSignature()

  async function handleSign(signerName: string, blob: Blob) {
    await uploadSignature.mutateAsync({ ticketId, signerName, blob })
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Customer Signature</DialogTitle>
        </DialogHeader>
        <SignatureCaptureForm
          onSign={handleSign}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}
