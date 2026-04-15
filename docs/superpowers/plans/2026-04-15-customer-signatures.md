# Customer Signatures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let field techs and admins collect a customer signature (on-site via canvas or remotely via email link) on any non-draft ticket, store it in Supabase Storage, display it in ticket pages and the PDF export, and show a "Signed" badge on all ticket list views.

**Architecture:** A canvas-based `SignaturePad` + `SignatureCaptureForm` handle drawing; `SignatureSection` orchestrates display vs. capture buttons; three Edge Functions handle token creation, token validation, and signature completion (remote flow); `is_signed` boolean on the `tickets` table drives list-view badges without extra joins.

**Tech Stack:** React 18 + TypeScript, React Query, Supabase (Postgres, Storage, Edge Functions / Deno), SendGrid, jsPDF (existing), Pointer Events API for cross-device canvas input.

---

## File Map

**Create:**
- `supabase/migrations/20260415000002_customer_signatures.sql`
- `src/hooks/useTicketSignature.ts`
- `src/components/SignaturePad.tsx`
- `src/components/SignatureCaptureForm.tsx`
- `src/components/SignatureCaptureModal.tsx`
- `src/components/SignatureDisplay.tsx`
- `src/components/SignatureSection.tsx`
- `src/pages/SignTicketPage.tsx`
- `supabase/functions/send-signature-request/index.ts`
- `supabase/functions/validate-signature-token/index.ts`
- `supabase/functions/complete-signature/index.ts`

**Modify:**
- `src/lib/database.types.ts` — regenerate after migration
- `src/App.tsx` — add public `/sign/:token` route
- `src/lib/exportTicketPdf.ts` — make async, add signature image rendering
- `src/pages/tech/TicketDetailPage.tsx` — add SignatureSection
- `src/pages/admin/AdminTicketReviewPage.tsx` — add SignatureSection, update handleExportPdf
- `src/pages/tech/MyTicketsPage.tsx` — add Signed badge
- `src/pages/admin/AdminTicketsPage.tsx` — add Signed badge
- `src/pages/admin/AdminDashboardPage.tsx` — add Signed badge
- `src/pages/NotificationPrefsPage.tsx` — add on_signed pref row
- `src/pages/admin/AdminUsersPage.tsx` — add on_signed pref row

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260415000002_customer_signatures.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ── Customer Signatures ──────────────────────────────────────────────────────
-- 1. signature_tokens — one-time tokens for remote signing links
create table signature_tokens (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references tickets(id) on delete cascade,
  token         uuid not null default gen_random_uuid() unique,
  requested_by  uuid not null references profiles(id),
  expires_at    timestamptz not null,
  used_at       timestamptz
);

create index idx_signature_tokens_ticket_id on signature_tokens(ticket_id);

-- All access is via Edge Functions with service role (bypasses RLS).
-- Enable RLS so anon/authenticated users cannot access directly.
alter table signature_tokens enable row level security;

-- 2. is_signed — denormalised flag for fast list queries
alter table tickets add column is_signed boolean not null default false;

-- 3. Trigger: flip is_signed when a customer signature row is inserted
create or replace function update_ticket_is_signed()
returns trigger language plpgsql security definer as $$
begin
  if new.kind = 'customer' then
    update tickets set is_signed = true where id = new.ticket_id;
  end if;
  return new;
end;
$$;

create trigger on_customer_signature_insert
  after insert on ticket_signatures
  for each row execute function update_ticket_is_signed();

-- Also handle upsert (on update, re-fire is_signed = true)
create trigger on_customer_signature_update
  after update on ticket_signatures
  for each row execute function update_ticket_is_signed();

-- 4. ticket-signatures Storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-signatures',
  'ticket-signatures',
  false,
  5242880,          -- 5 MB max per signature PNG
  array['image/png']
)
on conflict (id) do nothing;

-- Storage RLS: authenticated company members can read/write their own signatures
create policy "ticket-signatures select" on storage.objects
  for select using (
    bucket_id = 'ticket-signatures'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (auth_company_id())::text
  );

create policy "ticket-signatures insert" on storage.objects
  for insert with check (
    bucket_id = 'ticket-signatures'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (auth_company_id())::text
  );

create policy "ticket-signatures update" on storage.objects
  for update using (
    bucket_id = 'ticket-signatures'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (auth_company_id())::text
  );
-- Service role (edge functions) bypasses RLS for remote signature uploads.
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the `mcp__8f546672-0055-4b44-9c48-b40cfab4188e__apply_migration` tool with:
- `name`: `customer_signatures`
- `query`: (the SQL above)

- [ ] **Step 3: Verify**

Use `mcp__8f546672-0055-4b44-9c48-b40cfab4188e__execute_sql` with:
```sql
select column_name from information_schema.columns
where table_name = 'tickets' and column_name = 'is_signed';
```
Expected: one row returned.

```sql
select table_name from information_schema.tables
where table_name = 'signature_tokens';
```
Expected: one row returned.

- [ ] **Step 4: Set APP_URL secret in Supabase**

The `send-signature-request` edge function needs `APP_URL` to build signing links. Run in terminal:

```bash
npx supabase secrets set APP_URL=https://tradewind-tickets-claude.vercel.app --project-ref <your-project-ref>
```

(Find the project ref in `supabase/config.toml` or the Supabase dashboard.)

---

## Task 2: Regenerate Database Types

**Files:**
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1: Regenerate types**

Use the Supabase MCP tool `mcp__8f546672-0055-4b44-9c48-b40cfab4188e__generate_typescript_types`. Copy the output and overwrite `src/lib/database.types.ts`.

- [ ] **Step 2: Verify**

Open `src/lib/database.types.ts` and confirm:
- `tickets` Row type includes `is_signed: boolean`
- `signature_tokens` table types exist

- [ ] **Step 3: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "chore: regenerate DB types for customer signatures"
```

---

## Task 3: useTicketSignature Hook

**Files:**
- Create: `src/hooks/useTicketSignature.ts`

- [ ] **Step 1: Create the hook file**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const BUCKET = 'ticket-signatures'

export interface TicketSignature {
  id: string
  ticket_id: string
  kind: 'customer' | 'supervisor'
  signer_name: string | null
  signed_at: string
  image_url: string
  signedUrl: string
}

// ── Fetch the customer signature for a ticket ─────────────────────────────────
export function useTicketSignature(ticketId: string | undefined) {
  return useQuery({
    queryKey: ['ticket-signature', ticketId],
    queryFn: async (): Promise<TicketSignature | null> => {
      const { data, error } = await supabase
        .from('ticket_signatures')
        .select('*')
        .eq('ticket_id', ticketId!)
        .eq('kind', 'customer')
        .maybeSingle()
      if (error) throw error
      if (!data) return null

      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(data.image_url, 3600)

      return { ...data, signedUrl: signed?.signedUrl ?? '' } as TicketSignature
    },
    enabled: !!ticketId,
  })
}

// ── Upload on-site signature (authenticated user) ─────────────────────────────
export function useUploadSignature() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({
      ticketId,
      signerName,
      blob,
    }: {
      ticketId: string
      signerName: string
      blob: Blob
    }): Promise<TicketSignature> => {
      const path = `${profile!.company_id}/${ticketId}/customer.png`

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: 'image/png', upsert: true })
      if (uploadErr) throw uploadErr

      const { data: row, error: upsertErr } = await supabase
        .from('ticket_signatures')
        .upsert(
          {
            ticket_id: ticketId,
            kind: 'customer',
            signer_name: signerName,
            signed_at: new Date().toISOString(),
            image_url: path,
          },
          { onConflict: 'ticket_id,kind' }
        )
        .select()
        .single()
      if (upsertErr) throw upsertErr

      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600)

      return { ...row, signedUrl: signed?.signedUrl ?? '' } as TicketSignature
    },
    onSuccess: (_data, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ['ticket-signature', ticketId] })
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] })
      qc.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

// ── Request a remote signature token via edge function ────────────────────────
export function useRequestSignatureToken() {
  const { session } = useAuth()

  return useMutation({
    mutationFn: async ({
      ticketId,
      customerEmail,
    }: {
      ticketId: string
      customerEmail: string
    }) => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-signature-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session!.access_token}`,
          },
          body: JSON.stringify({ ticket_id: ticketId, customer_email: customerEmail }),
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Failed to send signature request')
      }
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "C:\Users\brian\Documents\Claude\Projects\Tradewind Tickets" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTicketSignature.ts
git commit -m "feat: add useTicketSignature hook"
```

---

## Task 4: SignaturePad Component

**Files:**
- Create: `src/components/SignaturePad.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useRef, useImperativeHandle, forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface SignaturePadRef {
  clear: () => void
  isEmpty: () => boolean
  toBlob: () => Promise<Blob>
}

interface SignaturePadProps {
  className?: string
}

export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  function SignaturePad({ className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawing = useRef(false)
    const hasStrokes = useRef(false)

    function getCtx() {
      const canvas = canvasRef.current!
      const ctx = canvas.getContext('2d')!
      ctx.strokeStyle = '#111827'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      return { ctx, canvas }
    }

    function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
      const rect = canvasRef.current!.getBoundingClientRect()
      return {
        x: (e.clientX - rect.left) * (canvasRef.current!.width / rect.width),
        y: (e.clientY - rect.top) * (canvasRef.current!.height / rect.height),
      }
    }

    function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      e.preventDefault()
      drawing.current = true
      hasStrokes.current = true
      canvasRef.current!.setPointerCapture(e.pointerId)
      const { ctx } = getCtx()
      const pos = getPos(e)
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }

    function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawing.current) return
      e.preventDefault()
      const { ctx } = getCtx()
      const pos = getPos(e)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    }

    function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
      e.preventDefault()
      drawing.current = false
    }

    useImperativeHandle(ref, () => ({
      clear() {
        const { ctx, canvas } = getCtx()
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        hasStrokes.current = false
      },
      isEmpty() {
        return !hasStrokes.current
      },
      toBlob() {
        return new Promise<Blob>((resolve, reject) => {
          canvasRef.current!.toBlob(
            blob => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
            'image/png'
          )
        })
      },
    }))

    return (
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={cn(
          'w-full touch-none border rounded-md bg-white cursor-crosshair',
          className
        )}
        style={{ height: '160px' }}
      />
    )
  }
)
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/SignaturePad.tsx
git commit -m "feat: add SignaturePad canvas component"
```

---

## Task 5: SignatureCaptureForm Component

**Files:**
- Create: `src/components/SignatureCaptureForm.tsx`

This is the shared form used by both the modal (on-site) and the public signing page (remote). It accepts an `onSign` callback so each consumer controls what happens on submit.

- [ ] **Step 1: Create the component**

```tsx
import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle } from 'lucide-react'
import { SignaturePad, type SignaturePadRef } from '@/components/SignaturePad'

interface SignatureCaptureFormProps {
  /** Called with the typed name and PNG blob when the user clicks Submit. Should throw on failure. */
  onSign: (signerName: string, blob: Blob) => Promise<void>
  onCancel?: () => void
  showCancel?: boolean
  submitLabel?: string
}

export function SignatureCaptureForm({
  onSign,
  onCancel,
  showCancel = true,
  submitLabel = 'Submit Signature',
}: SignatureCaptureFormProps) {
  const [signerName, setSignerName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const padRef = useRef<SignaturePadRef>(null)

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
      await onSign(signerName.trim(), blob)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save signature. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
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

      <div className="space-y-1.5">
        <Label>Signature</Label>
        <SignaturePad ref={padRef} />
        <button
          type="button"
          onClick={() => padRef.current?.clear()}
          disabled={submitting}
          className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-40"
        >
          Clear
        </button>
      </div>

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
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/SignatureCaptureForm.tsx
git commit -m "feat: add SignatureCaptureForm shared component"
```

---

## Task 6: SignatureCaptureModal Component

**Files:**
- Create: `src/components/SignatureCaptureModal.tsx`

This wraps `SignatureCaptureForm` in a Dialog and calls `useUploadSignature` for on-site signing.

- [ ] **Step 1: Create the component**

```tsx
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/SignatureCaptureModal.tsx
git commit -m "feat: add SignatureCaptureModal for on-site signing"
```

---

## Task 7: SignatureDisplay Component

**Files:**
- Create: `src/components/SignatureDisplay.tsx`

Renders the signature image, name, and timestamp in a locked-looking block.

- [ ] **Step 1: Create the component**

```tsx
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/SignatureDisplay.tsx
git commit -m "feat: add SignatureDisplay component"
```

---

## Task 8: SignatureSection Component

**Files:**
- Create: `src/components/SignatureSection.tsx`

Orchestrates: show `SignatureDisplay` if signed, show "Get Signature" + "Request via Email" buttons if not signed and canEdit, show "No signature" if not signed and read-only.

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react'
import { PenLine, Mail, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTicketSignature, useRequestSignatureToken } from '@/hooks/useTicketSignature'
import { SignatureCaptureModal } from '@/components/SignatureCaptureModal'
import { SignatureDisplay } from '@/components/SignatureDisplay'

interface SignatureSectionProps {
  ticketId: string
  canEdit: boolean
}

export function SignatureSection({ ticketId, canEdit }: SignatureSectionProps) {
  const { data: signature, isLoading } = useTicketSignature(ticketId)
  const requestToken = useRequestSignatureToken()

  const [captureOpen, setCaptureOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
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
    return <SignatureDisplay signature={signature} />
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/SignatureSection.tsx
git commit -m "feat: add SignatureSection orchestrator component"
```

---

## Task 9: send-signature-request Edge Function

**Files:**
- Create: `supabase/functions/send-signature-request/index.ts`

Authenticated endpoint (called by the logged-in tech or admin). Creates a token, invalidates any prior token for the ticket, sends the signing email.

- [ ] **Step 1: Create the function**

```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? ''
const SENDGRID_FROM = Deno.env.get('SENDGRID_FROM_EMAIL') ?? 'noreply@tradewindcontrols.com'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://tradewind-tickets-claude.vercel.app'

const SIGNATURE_TOKEN_EXPIRY_HOURS = 48

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    })

    // Verify caller is authenticated
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const { ticket_id, customer_email } = await req.json() as {
      ticket_id: string
      customer_email: string
    }

    if (!ticket_id || !customer_email) {
      return new Response(
        JSON.stringify({ error: 'ticket_id and customer_email are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch ticket + company name
    const { data: ticket, error: ticketErr } = await admin
      .from('tickets')
      .select('id, ticket_number, work_date, status, companies(name)')
      .eq('id', ticket_id)
      .single()

    if (ticketErr || !ticket) {
      return new Response(JSON.stringify({ error: 'Ticket not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (ticket.status === 'draft') {
      return new Response(
        JSON.stringify({ error: 'Cannot request signature on a draft ticket' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Invalidate any existing token for this ticket
    await admin.from('signature_tokens').delete().eq('ticket_id', ticket_id)

    // Create new token
    const expiresAt = new Date(
      Date.now() + SIGNATURE_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
    ).toISOString()

    const { data: tokenRow, error: tokenErr } = await admin
      .from('signature_tokens')
      .insert({ ticket_id, requested_by: user.id, expires_at: expiresAt })
      .select('token')
      .single()

    if (tokenErr || !tokenRow) throw tokenErr ?? new Error('Failed to create token')

    const signingUrl = `${APP_URL}/sign/${tokenRow.token}`
    const companyName = (ticket as { companies?: { name: string } }).companies?.name ?? 'Tradewind Controls'
    const workDate = new Date(ticket.work_date).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })

    if (!SENDGRID_API_KEY) {
      return new Response(JSON.stringify({ error: 'Email not configured on this server' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const html = `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
  <div style="border-bottom:3px solid #1d4ed8;padding-bottom:12px;margin-bottom:24px;">
    <span style="font-size:18px;font-weight:bold;color:#1d4ed8;">Tradewind Work Tickets</span>
  </div>
  <h2 style="margin:0 0 8px;">Signature Required</h2>
  <p style="color:#555;margin:0 0 16px;">
    ${companyName} has requested your signature for a completed field service ticket.
  </p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px;">
    <tr>
      <td style="padding:5px 0;color:#888;width:100px;">Ticket</td>
      <td style="padding:5px 0;font-weight:bold;">${ticket.ticket_number}</td>
    </tr>
    <tr>
      <td style="padding:5px 0;color:#888;">Date</td>
      <td style="padding:5px 0;">${workDate}</td>
    </tr>
  </table>
  <div style="text-align:center;margin:28px 0;">
    <a href="${signingUrl}"
       style="background:#1d4ed8;color:#fff;text-decoration:none;padding:13px 36px;
              border-radius:6px;font-weight:bold;font-size:15px;display:inline-block;">
      Sign Now
    </a>
  </div>
  <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
  <p style="color:#9ca3af;font-size:12px;margin:0;">
    This link expires in ${SIGNATURE_TOKEN_EXPIRY_HOURS} hours and can only be used once.
    If you did not expect this request, please contact ${companyName} directly.
  </p>
</body>
</html>`

    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: customer_email }] }],
        from: { email: SENDGRID_FROM, name: companyName },
        subject: `Please sign your service ticket ${ticket.ticket_number}`,
        content: [{ type: 'text/html', value: html }],
      }),
    })

    if (!sgRes.ok) {
      const body = await sgRes.text()
      console.error('SendGrid error:', body)
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/send-signature-request/index.ts
git commit -m "feat: add send-signature-request edge function"
```

---

## Task 10: validate-signature-token Edge Function

**Files:**
- Create: `supabase/functions/validate-signature-token/index.ts`

Public endpoint (`--no-verify-jwt`). Called by the `/sign/:token` page on load. Returns ticket summary or an error reason.

- [ ] **Step 1: Create the function**

```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { token } = await req.json() as { token: string }

    if (!token) {
      return new Response(JSON.stringify({ valid: false, reason: 'not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    })

    const { data: tokenRow, error } = await admin
      .from('signature_tokens')
      .select('id, ticket_id, expires_at, used_at')
      .eq('token', token)
      .maybeSingle()

    if (error) throw error

    if (!tokenRow) {
      return new Response(JSON.stringify({ valid: false, reason: 'not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (tokenRow.used_at) {
      return new Response(JSON.stringify({ valid: false, reason: 'used' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (new Date(tokenRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ valid: false, reason: 'expired' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch ticket summary to display on signing page
    const { data: ticket, error: ticketErr } = await admin
      .from('tickets')
      .select('ticket_number, work_date, work_description, companies(name)')
      .eq('id', tokenRow.ticket_id)
      .single()

    if (ticketErr || !ticket) {
      return new Response(JSON.stringify({ valid: false, reason: 'not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        valid: true,
        ticket: {
          ticket_number: ticket.ticket_number,
          work_date: ticket.work_date,
          work_description: ticket.work_description,
          company_name:
            (ticket as { companies?: { name: string } }).companies?.name ??
            'Tradewind Controls',
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/validate-signature-token/index.ts
git commit -m "feat: add validate-signature-token edge function"
```

---

## Task 11: complete-signature Edge Function

**Files:**
- Create: `supabase/functions/complete-signature/index.ts`

Public endpoint (`--no-verify-jwt`). Validates the token, uploads the PNG to storage, upserts the `ticket_signatures` row (triggering `is_signed = true` via DB trigger), marks the token used, and sends in-app + email notifications.

- [ ] **Step 1: Create the function**

```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? ''
const SENDGRID_FROM = Deno.env.get('SENDGRID_FROM_EMAIL') ?? 'noreply@tradewindcontrols.com'

const BUCKET = 'ticket-signatures'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { token, signer_name, signature_png_base64 } = await req.json() as {
      token: string
      signer_name: string
      signature_png_base64: string
    }

    if (!token || !signer_name || !signature_png_base64) {
      return new Response(
        JSON.stringify({ error: 'token, signer_name, and signature_png_base64 are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    })

    // Validate token
    const { data: tokenRow, error: tokenErr } = await admin
      .from('signature_tokens')
      .select('id, ticket_id, expires_at, used_at')
      .eq('token', token)
      .maybeSingle()

    if (tokenErr) throw tokenErr
    if (
      !tokenRow ||
      tokenRow.used_at ||
      new Date(tokenRow.expires_at) < new Date()
    ) {
      return new Response(JSON.stringify({ error: 'Invalid or expired link' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ticketId = tokenRow.ticket_id

    // Fetch ticket + company details
    const { data: ticket, error: ticketErr2 } = await admin
      .from('tickets')
      .select('id, ticket_number, company_id, created_by, companies(name)')
      .eq('id', ticketId)
      .single()
    if (ticketErr2 || !ticket) throw ticketErr2 ?? new Error('Ticket not found')

    // Upload signature image
    const imageBytes = Uint8Array.from(atob(signature_png_base64), c => c.charCodeAt(0))
    const path = `${ticket.company_id}/${ticketId}/customer.png`

    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(path, imageBytes, { contentType: 'image/png', upsert: true })
    if (uploadErr) throw uploadErr

    // Upsert ticket_signatures row (DB trigger flips tickets.is_signed = true)
    const { error: sigErr } = await admin
      .from('ticket_signatures')
      .upsert(
        {
          ticket_id: ticketId,
          kind: 'customer',
          signer_name,
          signed_at: new Date().toISOString(),
          image_url: path,
        },
        { onConflict: 'ticket_id,kind' }
      )
    if (sigErr) throw sigErr

    // Mark token as used (single-use)
    await admin
      .from('signature_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenRow.id)

    // Notify: tech (ticket creator) + all active admins in the company
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, email, first_name, role')
      .eq('company_id', ticket.company_id)
      .eq('is_active', true)

    const companyName =
      (ticket as { companies?: { name: string } }).companies?.name ?? 'Tradewind Controls'

    const recipients = (profiles ?? []).filter(
      p => p.role === 'admin' || p.id === ticket.created_by
    )

    // In-app notifications (always)
    if (recipients.length > 0) {
      await admin.from('notifications').insert(
        recipients.map(p => ({
          recipient_id: p.id,
          ticket_id: ticketId,
          event_type: 'ticket_signed',
          title: `Ticket ${ticket.ticket_number} signed`,
          body: `Signed by ${signer_name}`,
        }))
      )
    }

    // Email notifications (respects on_signed pref)
    if (SENDGRID_API_KEY && recipients.length > 0) {
      await Promise.allSettled(
        recipients.map(async (profile) => {
          const { data: pref } = await admin
            .from('notification_prefs')
            .select('email_frequency')
            .eq('user_id', profile.id)
            .eq('key', 'on_signed')
            .maybeSingle()

          const frequency = pref?.email_frequency ?? 'immediate'
          if (frequency === 'off') return

          if (frequency === 'digest') {
            await admin.from('notification_digest_queue').insert({
              recipient_id: profile.id,
              ticket_id: ticketId,
              event_type: 'ticket_signed',
              title: `Ticket ${ticket.ticket_number} signed`,
              body: `Signed by ${signer_name}`,
            })
            return
          }

          // immediate
          const html = `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
  <div style="border-bottom:3px solid #1d4ed8;padding-bottom:12px;margin-bottom:24px;">
    <span style="font-size:18px;font-weight:bold;color:#1d4ed8;">Tradewind Work Tickets</span>
  </div>
  <h2 style="margin:0 0 8px;">Ticket Signed</h2>
  <p style="color:#555;margin:0 0 16px;">
    Hi ${profile.first_name}, ticket <strong>${ticket.ticket_number}</strong>
    has been signed by <strong>${signer_name}</strong>.
  </p>
</body>
</html>`

          await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${SENDGRID_API_KEY}`,
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: profile.email }] }],
              from: { email: SENDGRID_FROM, name: companyName },
              subject: `Ticket ${ticket.ticket_number} has been signed`,
              content: [{ type: 'text/html', value: html }],
            }),
          })
        })
      )
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/complete-signature/index.ts
git commit -m "feat: add complete-signature edge function"
```

---

## Task 12: Deploy Edge Functions

- [ ] **Step 1: Deploy send-signature-request (authenticated)**

```bash
cd "C:\Users\brian\Documents\Claude\Projects\Tradewind Tickets"
npx supabase functions deploy send-signature-request --project-ref <your-project-ref>
```

- [ ] **Step 2: Deploy validate-signature-token (public)**

```bash
npx supabase functions deploy validate-signature-token --no-verify-jwt --project-ref <your-project-ref>
```

- [ ] **Step 3: Deploy complete-signature (public)**

```bash
npx supabase functions deploy complete-signature --no-verify-jwt --project-ref <your-project-ref>
```

Expected output for each: `Deployed Function <name> on project <ref>`

---

## Task 13: Public Signing Page + Route

**Files:**
- Create: `src/pages/SignTicketPage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the page**

```tsx
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
```

- [ ] **Step 2: Add the public route in `src/App.tsx`**

Read `src/App.tsx`. Find the line containing `<Route path="/login"` (or similar public routes near the top). Add the signing route as a sibling public route. The route must be OUTSIDE the `<ProtectedRoute>` wrapper.

Add this import at the top of App.tsx:
```tsx
import { SignTicketPage } from '@/pages/SignTicketPage'
```

Add this route alongside the other public routes (before the ProtectedRoute wrapper):
```tsx
<Route path="/sign/:token" element={<SignTicketPage />} />
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SignTicketPage.tsx src/App.tsx
git commit -m "feat: add public signing page and /sign/:token route"
```

---

## Task 14: Wire SignatureSection into Ticket Pages

**Files:**
- Modify: `src/pages/tech/TicketDetailPage.tsx`
- Modify: `src/pages/admin/AdminTicketReviewPage.tsx`

### TicketDetailPage

- [ ] **Step 1: Add import to TicketDetailPage**

Read `src/pages/tech/TicketDetailPage.tsx` lines 1–15 (imports). Add after the last import:
```tsx
import { SignatureSection } from '@/components/SignatureSection'
```

- [ ] **Step 2: Add Signature card before the Photos card**

In `TicketDetailPage`, find the Photos card block:
```tsx
{/* Photos */}
<Card>
  <CardHeader className="pb-2">
    <CardTitle className="text-sm">Photos</CardTitle>
  </CardHeader>
```

Insert the Signature card immediately **before** it. The ticket's status determines `canEdit` — signatures can be collected any time after draft:

```tsx
{/* Customer Signature */}
<Card>
  <CardHeader className="pb-2">
    <CardTitle className="text-sm">Customer Signature</CardTitle>
  </CardHeader>
  <CardContent>
    <SignatureSection ticketId={t.id} canEdit={t.status !== 'draft'} />
  </CardContent>
</Card>
```

### AdminTicketReviewPage

- [ ] **Step 3: Add import to AdminTicketReviewPage**

Read `src/pages/admin/AdminTicketReviewPage.tsx` lines 1–30 (imports). Add after the PhotoUploader import:
```tsx
import { SignatureSection } from '@/components/SignatureSection'
```

- [ ] **Step 4: Add Signature card in AdminTicketReviewPage**

Find the Photos card block (the one with `<PhotoUploader ...>`). Insert the Signature card immediately **before** it:

```tsx
{/* Customer Signature */}
<Card>
  <CardHeader className="pb-2">
    <CardTitle className="text-sm">Customer Signature</CardTitle>
  </CardHeader>
  <CardContent>
    <SignatureSection ticketId={t.id} canEdit={true} />
  </CardContent>
</Card>
```

(Admin can always collect/request a signature, even on finalized tickets.)

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/tech/TicketDetailPage.tsx src/pages/admin/AdminTicketReviewPage.tsx
git commit -m "feat: add SignatureSection to TicketDetailPage and AdminTicketReviewPage"
```

---

## Task 15: Signed Badge on Ticket List Views

Add a green "Signed" badge to the ticket row badge cluster on three pages. The `is_signed` field is already on the ticket row (added in Task 1, included in `select('*')` queries).

**Files:**
- Modify: `src/pages/tech/MyTicketsPage.tsx`
- Modify: `src/pages/admin/AdminTicketsPage.tsx`
- Modify: `src/pages/admin/AdminDashboardPage.tsx`

### MyTicketsPage

- [ ] **Step 1: Read the badge cluster in MyTicketsPage**

Read `src/pages/tech/MyTicketsPage.tsx` lines 47–70 (the `TicketRow` component). Find the `<div className="flex items-center gap-2 flex-wrap">` containing the status badge.

- [ ] **Step 2: Add Signed badge after the status Badge**

In the badge cluster `<div>` (after the `has_post_finalize_changes` badge), add:
```tsx
{ticket.is_signed && (
  <Badge variant="outline" className="text-xs h-4 px-1.5 text-green-700 border-green-300 bg-green-50">
    Signed
  </Badge>
)}
```

### AdminTicketsPage

- [ ] **Step 3: Add Signed badge in AdminTicketsPage**

Read `src/pages/admin/AdminTicketsPage.tsx`. Find the `TicketRow` component (or inline row rendering) and locate the badge cluster `<div className="flex items-center gap-2 flex-wrap">`. Add the same badge after the `has_post_finalize_changes` badge:

```tsx
{t.is_signed && (
  <Badge variant="outline" className="text-xs h-4 px-1.5 text-green-700 border-green-300 bg-green-50">
    Signed
  </Badge>
)}
```

### AdminDashboardPage

- [ ] **Step 4: Add Signed badge in AdminDashboardPage**

Read `src/pages/admin/AdminDashboardPage.tsx` lines 193–220 (the Pending Review list row rendering). Find the badge cluster. Add the same badge after the `returnRequested` badge:

```tsx
{t.is_signed && (
  <Badge variant="outline" className="text-xs h-4 px-1.5 text-green-700 border-green-300 bg-green-50">
    Signed
  </Badge>
)}
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/tech/MyTicketsPage.tsx src/pages/admin/AdminTicketsPage.tsx src/pages/admin/AdminDashboardPage.tsx
git commit -m "feat: add Signed badge to ticket list views"
```

---

## Task 16: on_signed Notification Preference

**Files:**
- Modify: `src/pages/NotificationPrefsPage.tsx`
- Modify: `src/pages/admin/AdminUsersPage.tsx`

### NotificationPrefsPage

- [ ] **Step 1: Read NotificationPrefsPage**

Read `src/pages/NotificationPrefsPage.tsx`. Find where pref rows are defined — there will be arrays like `ADMIN_NOTIF_PREFS` and `USER_NOTIF_PREFS` (or similar). Each entry has a `key` and a `label`.

- [ ] **Step 2: Add on_signed to both arrays**

Add `{ key: 'on_signed', label: 'Ticket signed by customer' }` to BOTH the admin prefs array AND the tech/user prefs array. Both roles should receive this notification.

Example (adapt to match the actual variable names in the file):
```tsx
// In ADMIN_NOTIF_PREFS array:
{ key: 'on_signed', label: 'Ticket signed by customer' },

// In USER_NOTIF_PREFS (or TECH_NOTIF_PREFS) array:
{ key: 'on_signed', label: 'Ticket signed by customer' },
```

### AdminUsersPage

- [ ] **Step 3: Add on_signed to AdminUsersPage pref arrays**

Read `src/pages/admin/AdminUsersPage.tsx`. Find the same pref key arrays (copied from NotificationPrefsPage pattern). Add `{ key: 'on_signed', label: 'Ticket signed by customer' }` to both the admin and tech pref arrays there as well.

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/NotificationPrefsPage.tsx src/pages/admin/AdminUsersPage.tsx
git commit -m "feat: add on_signed notification preference"
```

---

## Task 17: PDF Export — Signature Image

**Files:**
- Modify: `src/lib/exportTicketPdf.ts`
- Modify: `src/pages/admin/AdminTicketReviewPage.tsx`

The `ExportTicketData.ticket_signatures` interface already exists with `kind`, `signer_name`, `signed_at`. We need to:
1. Add a `signedUrl?: string` field to the interface
2. Make `exportTicketPdf` async so it can fetch the image
3. Render the signature image in the PDF
4. In `AdminTicketReviewPage.handleExportPdf()`, generate the signed URL before calling the export

- [ ] **Step 1: Read exportTicketPdf.ts**

Read `src/lib/exportTicketPdf.ts` in full. Note:
- The `ExportTicketData` interface (lines 8–60 approx)
- The signatures section at the end of the PDF rendering function
- The existing `export function exportTicketPdf(data: ExportTicketData)` signature

- [ ] **Step 2: Update ExportTicketData and make the function async**

Find the `ticket_signatures` field in `ExportTicketData` and add `signedUrl`:
```typescript
ticket_signatures?: {
  kind: string
  signer_name: string | null
  signed_at: string
  signedUrl?: string          // ← add this field
}[]
```

Change the function signature from:
```typescript
export function exportTicketPdf(data: ExportTicketData) {
```
to:
```typescript
export async function exportTicketPdf(data: ExportTicketData): Promise<void> {
```

- [ ] **Step 3: Fill in the signature rendering section**

Find the signatures section in `exportTicketPdf` (search for `ticket_signatures` or `signer_name`). Replace or fill it with:

```typescript
// ── Signatures ────────────────────────────────────────────────────────────────
const customerSig = data.ticket_signatures?.find(s => s.kind === 'customer')
if (customerSig) {
  y = checkPageBreak(doc, y, 50)
  y += SECTION_GAP

  // Section label
  doc.setFontSize(9)
  doc.setTextColor(...TITLE_COLOR)
  doc.setFont('helvetica', 'bold')
  doc.text('Customer Signature', PAGE_MARGIN, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(0, 0, 0)

  // Signature image
  if (customerSig.signedUrl) {
    try {
      const response = await fetch(customerSig.signedUrl)
      const blob = await response.blob()
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      doc.addImage(`data:image/png;base64,${base64}`, 'PNG', PAGE_MARGIN, y, 70, 23)
      y += 25
    } catch {
      // Skip image if fetch fails — still show name/date below
    }
  }

  // Signature line
  doc.setDrawColor(180, 180, 180)
  doc.line(PAGE_MARGIN, y, PAGE_MARGIN + 80, y)
  y += 4

  // Signer name + date
  doc.setFontSize(8)
  doc.setTextColor(80, 80, 80)
  doc.text(customerSig.signer_name ?? '', PAGE_MARGIN, y)
  doc.text(
    format(new Date(customerSig.signed_at), 'MMM d, yyyy h:mm a'),
    PAGE_MARGIN + 85,
    y
  )
  y += 5
}
```

- [ ] **Step 4: Update AdminTicketReviewPage.handleExportPdf()**

Read `src/pages/admin/AdminTicketReviewPage.tsx` and find the `handleExportPdf` function (around line 255). Replace it with a version that generates signed URLs before calling the export:

```typescript
async function handleExportPdf() {
  setExportingPdf(true)
  try {
    // Build export data — generate signed URL for customer signature if present
    const exportData = { ...(t as unknown as ExportTicketData) }
    if (t.ticket_signatures && t.ticket_signatures.length > 0) {
      const sigsWithUrls = await Promise.all(
        t.ticket_signatures.map(async (sig: { kind: string; signer_name: string | null; signed_at: string; image_url: string }) => {
          const { data: signed } = await supabase.storage
            .from('ticket-signatures')
            .createSignedUrl(sig.image_url, 120)
          return { ...sig, signedUrl: signed?.signedUrl }
        })
      )
      exportData.ticket_signatures = sigsWithUrls
    }
    await exportTicketPdf(exportData)
    await logExport.mutateAsync({ ticketId: t!.id, format: 'pdf' })
  } finally {
    setExportingPdf(false)
  }
}
```

Also add the `supabase` import at the top of `AdminTicketReviewPage.tsx` if it isn't already imported:
```typescript
import { supabase } from '@/lib/supabase'
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/exportTicketPdf.ts src/pages/admin/AdminTicketReviewPage.tsx
git commit -m "feat: render customer signature image in PDF export"
```

---

## Task 18: Full Build, Push, Verify

- [ ] **Step 1: Run production build**

```bash
cd "C:\Users\brian\Documents\Claude\Projects\Tradewind Tickets" && npm run build
```

Expected: `✓ built in Xs` with no TypeScript errors. The chunk size warning is pre-existing and expected.

- [ ] **Step 2: Push to trigger Vercel deploy**

```bash
git push
```

- [ ] **Step 3: Manual smoke test checklist**

After Vercel deploys:

1. **On-site signing (tech):** Open a submitted ticket on the tech's My Tickets page → open TicketDetailPage → click "Get Signature" → draw + type name → Submit → verify "Signed" badge appears on My Tickets list
2. **On-site signing (admin):** Open a submitted ticket in AdminTicketReviewPage → click "Get Signature" → draw + type name → Submit → verify signature block appears
3. **Remote signing:** On a submitted ticket, click "Request via Email" → enter an email → confirm success toast → check inbox → click "Sign Now" link → fill in name and signature → Submit → verify thank-you screen → verify ticket shows "Signed" badge in admin lists
4. **Expired link:** Let a token expire (or test with a manually-set past `expires_at` in the DB) → confirm the error page shows
5. **PDF export:** On a finalized + signed ticket, click "Export PDF" → verify signature image, name, and date appear in the PDF
6. **Read-only view:** On a non-editable page state, verify "No signature collected" message appears instead of buttons
