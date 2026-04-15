import { Lock, ImageIcon } from 'lucide-react'
import { format } from 'date-fns'
import type { TicketSignature } from '@/hooks/useTicketSignature'

interface SignatureDisplayProps {
  signature: TicketSignature
}

export function SignatureDisplay({ signature }: SignatureDisplayProps) {
  return (
    <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
      {/* Signature image */}
      <div className="h-28 flex items-center justify-center bg-white border rounded-md overflow-hidden">
        {signature.signedUrl ? (
          <img
            src={signature.signedUrl}
            alt="Customer signature"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground/30" />
        )}
      </div>

      {/* Signer info */}
      <div className="flex items-center gap-1.5 text-sm">
        <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium">{signature.signer_name ?? 'Unknown'}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground text-xs">
          {format(new Date(signature.signed_at), 'MMM d, yyyy h:mm a')}
        </span>
      </div>
    </div>
  )
}
