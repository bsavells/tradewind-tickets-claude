import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { SignatureCaptureForm } from '@/components/SignatureCaptureForm'

type InvalidReason = 'expired' | 'used' | 'not_found'

type PageState =
  | { status: 'loading' }
  | { status: 'invalid'; reason: InvalidReason }
  | {
      status: 'valid'
      ticket: {
        ticket_number: string
        work_date: string
        work_description: string | null
        company_name: string
      }
    }
  | { status: 'success'; signerName: string }

const INVALID_MESSAGES: Record<InvalidReason, string> = {
  expired:
    'This signature link has expired. Please contact the office to request a new one.',
  used: 'This signature link has already been used. Your signature has been recorded.',
  not_found: 'This link is not valid. Please contact the office for assistance.',
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function SignTicketPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PageState>({ status: 'loading' })

  useEffect(() => {
    if (!token) {
      setState({ status: 'invalid', reason: 'not_found' })
      return
    }
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-signature-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          setState({ status: 'valid', ticket: data.ticket })
        } else {
          setState({ status: 'invalid', reason: data.reason as InvalidReason })
        }
      })
      .catch(() => setState({ status: 'invalid', reason: 'not_found' }))
  }, [token])

  async function handleSign(signerName: string, blob: Blob) {
    const base64 = await blobToBase64(blob)
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/complete-signature`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          signer_name: signerName,
          signature_png_base64: base64,
        }),
      }
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err as { error?: string }).error ?? 'Failed to save signature')
    }
    setState({ status: 'success', signerName })
  }

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (state.status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" />
          <h1 className="text-xl font-semibold">Link Unavailable</h1>
          <p className="text-muted-foreground text-sm">
            {INVALID_MESSAGES[state.reason]}
          </p>
        </div>
      </div>
    )
  }

  if (state.status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
          <h1 className="text-xl font-semibold">Signature Recorded</h1>
          <p className="text-muted-foreground text-sm">
            Thank you, {state.signerName}. Your signature has been recorded successfully.
          </p>
        </div>
      </div>
    )
  }

  const { ticket } = state
  const workDate = new Date(ticket.work_date).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-background">
      {/* Company header */}
      <div className="border-b px-4 py-3 bg-white">
        <p className="text-sm font-bold text-blue-700">{ticket.company_name}</p>
      </div>

      <div className="max-w-lg mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold">Sign Service Ticket</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {ticket.company_name} is requesting your signature to acknowledge the
            completion of the following field service work.
          </p>
        </div>

        {/* Ticket summary */}
        <div className="border rounded-lg p-4 space-y-2 bg-muted/30">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Ticket</span>
            <span className="font-medium">{ticket.ticket_number}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Date</span>
            <span>{workDate}</span>
          </div>
          {ticket.work_description && (
            <div className="text-sm pt-2 border-t mt-2">
              <p className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
                Work Performed
              </p>
              <p className="whitespace-pre-wrap leading-relaxed">
                {ticket.work_description}
              </p>
            </div>
          )}
        </div>

        {/* Signature form */}
        <SignatureCaptureForm
          onSign={handleSign}
          showCancel={false}
          submitLabel="Submit Signature"
        />
      </div>
    </div>
  )
}
