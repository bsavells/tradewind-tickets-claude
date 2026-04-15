# Customer Signatures Design

**Date:** 2026-04-15  
**Status:** Approved

---

## Goal

Allow customers to sign field service tickets — either on-site (tech hands them a device) or remotely (customer receives an email link). One customer signature per ticket, stored as a PNG image alongside a printed name and timestamp.

---

## Scope

- Customer signature only (no supervisor/tech signature)
- Signature image + printed name required; timestamp recorded automatically
- Collectable any time after the ticket leaves draft (submitted, returned, or finalized states)
- Both admin and tech can initiate a signature request
- Visual signed indicator on all ticket list views

---

## Data Layer

### `ticket_signatures` (existing table, already correct shape)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `ticket_id` | uuid | FK → tickets |
| `kind` | text | `'customer'` (supervisor reserved for future use) |
| `signer_name` | text | Typed by the signer |
| `signed_at` | timestamptz | Set at signing time |
| `image_url` | text | Storage path in `ticket-signatures` bucket |

One row per `(ticket_id, kind)` — enforced by unique constraint. Signatures cannot be overwritten once collected.

### `signature_tokens` (new table)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `ticket_id` | uuid | FK → tickets |
| `token` | uuid | Unique, URL-safe identifier |
| `requested_by` | uuid | FK → profiles |
| `expires_at` | timestamptz | `now() + SIGNATURE_TOKEN_EXPIRY_HOURS` |
| `used_at` | timestamptz | Null until signed; set on completion |

One active token per ticket — creating a new token invalidates (deletes) any previous token for that ticket.

### `tickets` table addition

- Add `is_signed boolean NOT NULL DEFAULT false`
- Set to `true` via a DB trigger when a `ticket_signatures` row is inserted for `kind = 'customer'`

### `ticket-signatures` Storage bucket

- Private bucket, same pattern as `ticket-photos`
- Company-scoped RLS: path prefix `{company_id}/`
- Signature image path: `{company_id}/{ticket_id}/customer.png`
- Upsert mode (`upsert: true`) — deterministic path means no orphans

### Notification preference

- New pref key: `on_signed`
- Default: `immediate` for both admin and tech roles
- Added to `NotificationPrefsPage` and `AdminUsersPage` (same pattern as existing prefs)

---

## On-Site Signing Flow

1. Tech or admin opens a ticket (any non-draft status)
2. If no signature exists: **"Get Signature"** button is visible
3. Clicking opens `SignatureCaptureModal` — a full-screen-on-mobile dialog:
   - Printed name field (text input, required)
   - Canvas signature pad (pointer/touch events via Pointer Events API — works with mouse, finger, and stylus)
   - Canvas prevents default scroll while drawing
   - Clear and Submit buttons
4. On submit:
   - Canvas exported as PNG blob
   - Uploaded to `ticket-signatures` storage at `{company_id}/{ticket_id}/customer.png`
   - `ticket_signatures` row inserted (`kind = 'customer'`, `signer_name`, `signed_at = now()`, `image_url = storage path`)
   - DB trigger flips `tickets.is_signed = true`
   - Modal closes; page shows signature display block

---

## Remote Signing Flow

1. Tech or admin clicks **"Request Signature"** button on their respective ticket page
2. A dialog prompts for the customer's email address (always a manual entry — the customers table has no top-level email field; contacts are optional and may not exist)
3. On confirm:
   - Any existing token for the ticket is deleted
   - New `signature_tokens` row created with `expires_at = now() + 48h`
   - `send-signature-request` Edge Function sends a SendGrid email to the customer
   - Email contains a link to `/sign/{token}`
4. Customer opens `/sign/{token}` — a **public route, no authentication required**:
   - Token validated: must exist, not expired (`expires_at > now()`), and not used (`used_at IS NULL`)
   - If invalid/expired/used: clear error message shown, customer prompted to contact the office
   - If valid: displays ticket summary (ticket number, date, company name, description of work)
   - Same `SignatureCaptureModal` UI presented
5. On submit:
   - PNG uploaded to storage
   - `ticket_signatures` row inserted
   - `signature_tokens.used_at` set to `now()` (link becomes single-use)
   - DB trigger flips `tickets.is_signed = true`
   - `ticket_signed` notification sent to tech and admin
   - Page shows "Thank you — your signature has been recorded" confirmation

### Token expiry

`SIGNATURE_TOKEN_EXPIRY_HOURS = 48` — defined as a constant in the edge function, easy to change without a code deploy.

---

## Components

### `SignaturePad`

- Props: `{ onEnd: (blob: Blob) => void; className?: string }`
- Thin canvas wrapper; draws via Pointer Events API
- Exposes `clear()` via ref
- `toBlob()` internally on pointer up, fires `onEnd`

### `SignatureCaptureModal`

- Props: `{ ticketId: string; onSuccess: () => void; onClose: () => void }`
- Contains: name input + `SignaturePad` + Clear + Submit
- Handles upload + DB insert + error states
- Used on `TicketDetailPage`, `AdminTicketReviewPage`, and `/sign/[token]`

### `SignatureDisplay`

- Props: `{ signature: TicketSignature }`
- Renders signature image (signed URL), "Signed by [Name]", formatted date/time, lock icon
- Used on `TicketDetailPage`, `AdminTicketReviewPage` (replaces the Get/Request buttons once signed)

### `useTicketSignature` hook

- Fetches the customer signature for a ticket (single row query)
- `useUploadSignature` mutation: storage upload + DB insert
- `useRequestSignatureToken` mutation: creates token + triggers email

---

## Page Changes

### `TicketDetailPage` (tech)

- Add signature section below Photos card
- Shows `SignatureCaptureModal` trigger ("Get Signature" + "Request Signature" buttons) when unsigned
- Shows `SignatureDisplay` when signed

### `AdminTicketReviewPage`

- Same signature section below Photos card
- Same logic: buttons when unsigned, display when signed

### `/sign/[token]` (new public page)

- No auth required
- Validates token, shows ticket summary, renders `SignatureCaptureModal`
- Thank-you state on completion
- Error state for invalid/expired/used tokens

### Ticket list rows (all four views)

**Pages affected:** `AdminDashboardPage`, `AdminTicketsPage`, `MyTicketsPage` (tech), admin user's tickets view

- Add green **"Signed"** `<Badge>` to the badge row when `ticket.is_signed === true`
- No additional query needed — `is_signed` is a column on the tickets row already fetched

### `NotificationPrefsPage` + `AdminUsersPage`

- Add `on_signed` pref row (label: "Ticket signed by customer")
- Both admin and tech sections get this pref
- Default: `immediate`

---

## `send-signature-request` Edge Function

- Triggered by "Request Signature" button via direct function invocation
- Input: `{ ticket_id, customer_email, token }`
- Fetches ticket summary for email body (ticket number, date, work description excerpt)
- Sends via SendGrid: subject "Please sign your service ticket [TW-YY-NNNNN]"
- Email body: brief summary + prominent "Sign Now" button linking to `/sign/{token}`
- Same JWT-authenticated pattern as `notify-ticket-event`

---

## PDF Export

The existing signatures section in `exportTicketPdf.ts` is already stubbed. Fill it in:
- Renders signature image inline (fetched as base64 from signed URL)
- "Customer Signature" label, printed name, and formatted timestamp below image
- Section omitted entirely if `is_signed = false` (no blank line)

---

## Migration

Single migration file covering:
1. `signature_tokens` table + indexes (unique on `token`; index on `ticket_id` for fast invalidation) + RLS
2. `tickets.is_signed` column
3. `is_signed` trigger on `ticket_signatures` insert
4. `ticket-signatures` storage bucket + RLS policies

---

## Out of Scope

- Supervisor/tech signatures
- Legal enforceability / audit-grade e-signature compliance
- Signature revocation or re-signing
- PDF attached to signature email
