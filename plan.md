# Tradewind Tickets — App Plan

## Overview

A reactive web application replacing the Excel "Work Ticket" used by Tradewind Controls field technicians. Field techs capture job details, labor, materials, vehicles, and equipment on their phones. Admins review, set pricing, and finalize tickets from a desktop browser. The system produces a clean audit trail and exports PDF/XLSX on demand.

---

## Infrastructure

| Item | Value |
|---|---|
| Supabase Project | `rvczzujbzfsbljbajjgp` |
| API URL | `https://rvczzujbzfsbljbajjgp.supabase.co` |
| GitHub Repo | `https://github.com/bsavells/tradewind-tickets-claude` |
| Vercel Staging | `https://tradewind-tickets-claude.vercel.app` |
| Storage Buckets | `ticket-signatures`, `ticket-photos`, `ticket-exports` (all private) |
| Email | SendGrid (password reset + notifications) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix UI) |
| Routing | React Router v6 |
| Server state | TanStack Query |
| Forms | React Hook Form + Zod |
| Database/Auth | Supabase (Postgres + Auth + Storage + Realtime + RLS) |
| Edge Functions | Deno (Supabase) |
| Email | SendGrid |
| Signature capture | `signature_pad` |
| Draft persistence | `idb-keyval` (IndexedDB) |
| Exports | Edge Function: headless Chromium (PDF) + `exceljs` (XLSX) |
| Deployment | Vercel (auto-deploy from `main`) |

---

## Roles

| Role | Capabilities |
|---|---|
| **tech** | Create, edit, submit, and delete own draft tickets; capture customer signature; view own ticket history |
| **admin** (writable) | Everything a tech can do + manage users/customers/vehicles/classifications; review all tickets; set pricing; finalize/unfinalize/return tickets; delete non-finalized tickets; export PDF/XLSX |
| **admin** (readonly) | View all tickets and export PDF/XLSX; cannot create, edit, finalize, or set rates |

Roles are enforced at both the Postgres RLS level and the UI level.

---

## Data Model

### Core tables

**`tickets`** — One row per field ticket.
- `id`, `company_id`, `ticket_number` (format: `TW-YY-#####`), `status` (`draft | submitted | returned | finalized`)
- `customer_id`, `requestor` (free text), `job_number`, `job_location`, `job_problem`
- `ticket_type` (e.g. "Service Call"), `work_date`, `work_description`
- `equipment_enabled` (boolean toggle)
- `grand_total` (computed by DB triggers)
- `has_post_finalize_changes` (flag — exports are stale)
- `finalized_at`, `finalized_by`, `created_by`, `created_at`, `updated_at`

**`ticket_materials`** — Line items for parts/materials.
- `ticket_id`, `sort_order`, `qty`, `part_number`, `description`, `price_each`, `total` (computed)

**`ticket_labor`** — Labor rows per tech per shift.
- `ticket_id`, `sort_order`, `user_id` (nullable), `first_name`, `last_name`, `classification_snapshot`
- `start_time`, `end_time`, `hours` (raw entry), `reg_hours`, `ot_hours` (admin-split)
- `reg_rate`, `ot_rate`, `reg_total`, `ot_total`, `row_total` (all computed)

**`ticket_vehicles`** — Vehicle mileage rows.
- `ticket_id`, `sort_order`, `vehicle_id`, `vehicle_label`, `mileage_start`, `mileage_end`, `rate`, `total` (computed)

**`ticket_equipment`** — Equipment usage rows (optional section).
- `ticket_id`, `sort_order`, `equip_number`, `hours`, `rate`, `total` (computed)

**`ticket_photos`** — Photo attachments per ticket.
- `ticket_id`, `storage_path`, `thumb_path`, `original_filename`, `mime_type`, `size_bytes`, `exif_preserved`

**`ticket_signatures`** — Customer and supervisor signatures.
- `ticket_id`, `role` (`customer | supervisor`), `storage_path`, `signed_at`, `signer_name`

**`ticket_audit_log`** — Immutable event log (append-only).
- `ticket_id`, `actor_id`, `actor_name`, `action` (`submitted | returned | finalized | unfinalized | edited_by_admin | exported`), `note`, `created_at`

**`ticket_exports`** — Record of every PDF/XLSX export.
- `ticket_id`, `format` (`pdf | xlsx`), `storage_path`, `exported_by`, `exported_at`

### Reference tables

**`customers`** — Customer companies.
- `company_id`, `name`, `address`, `city`, `state`, `zip`, `phone`, `active`

**`customer_contacts`** — Contacts within a customer.
- `customer_id`, `name`, `title`, `phone`, `email`, `is_primary`

**`profiles`** — Extends `auth.users` with app-specific fields.
- `id` (FK → auth.users), `company_id`, `role` (`tech | admin`), `is_readonly_admin`
- `first_name`, `last_name`, `classification_id`, `active`

**`classifications`** — Labor rate classes (e.g. Journeyman, Apprentice).
- `company_id`, `name`, `default_reg_rate`, `default_ot_rate`, `sort_order`

**`vehicles`** — Company vehicles.
- `company_id`, `label`, `type`, `default_rate`, `active`

**`ticket_number_sequences`** — Per-company yearly counters.
- `company_id`, `year`, `last_seq`

---

## Ticket Lifecycle

```
draft → submitted → finalized
             ↕
          returned
```

- Tech creates ticket as **draft**; autosaved to IndexedDB while editing.
- Tech submits → status becomes **submitted**; audit log entry written.
- Admin reviews, sets/overrides pricing, adds OT split.
- Admin **returns** ticket → status becomes **returned**; tech can edit and resubmit.
- Admin **finalizes** → status becomes **finalized**; `finalized_at` and `finalized_by` set.
- Admin can **unfinalize** a finalized ticket (returns to `submitted`).
- Post-finalize edits (admin pricing changes after finalization) flip `has_post_finalize_changes = true`.
- Ticket **deletion**: techs can delete own `draft` tickets; writable admins can delete any non-`finalized` ticket.

---

## Ticket Numbering

Format: `TW-YY-#####` (e.g. `TW-26-00001`). Counter lives in `ticket_number_sequences` and resets every January 1. Multi-tenant ready — one row per `(company_id, year)`.

---

## Pricing Rules

- Techs **never** see or set dollar amounts.
- Rates (labor classification rates, vehicle mileage rate) auto-populate from their reference rows when a line is added.
- Admins may override any rate or hours split per line at review time.
- Row totals and grand total are computed by Postgres `BEFORE` triggers (on INSERT/UPDATE of child rows) so data stays consistent regardless of source.

---

## Computed Fields (DB Triggers)

All computed fields are maintained by `SECURITY DEFINER` Postgres functions to avoid RLS conflicts:

- `ticket_materials.total = round(qty * price_each, 2)`
- `ticket_labor.reg_total = round(reg_hours * reg_rate, 2)`, similarly `ot_total`, `row_total`
- `ticket_vehicles.total = round((mileage_end - mileage_start) * rate, 2)`
- `ticket_equipment.total = round(rate * hours, 2)`
- `tickets.grand_total` = sum of all child table totals, recomputed via `AFTER INSERT OR UPDATE` trigger on each child table

---

## Edge Functions

### `manage-user` (deployed)
Handles admin user management operations that require the Supabase service role key:
- `action: 'create'` — creates auth user, sets profile, sends password reset email
- `action: 'delete'` — deletes auth user and profile
- `action: 'send_reset'` — sends password reset email
- Caller must be a writable admin (verified internally via JWT)

### `delete-ticket` (via RPC function `delete_ticket_safe`)
`SECURITY DEFINER` Postgres RPC that:
- Verifies caller authorization (tech can delete own drafts; admin can delete non-finalized)
- Deletes child rows in order (avoids CASCADE + RLS conflict on `ticket_audit_log_ticket_id_fkey`)
- Then deletes the parent ticket

### `export-ticket` (planned)
- `format: 'pdf'` — renders ticket HTML with headless Chromium, stores to `ticket-exports` bucket
- `format: 'xlsx'` — builds workbook with `exceljs`, stores to `ticket-exports` bucket
- Writes a `ticket_exports` row and an `exported` audit log entry
- Returns a signed URL valid for 60 seconds

---

## Admin Pages

| Page | Path | Purpose |
|---|---|---|
| Dashboard | `/admin/dashboard` | Stat cards (pending, finalized this month, drafts, total) + top-10 pending feed |
| All Tickets | `/admin/tickets` | Filterable ticket list (status pills + search); click to review |
| Ticket Review | `/admin/tickets/:id` | Line item pricing, OT split, finalize/unfinalize/return/delete actions |
| Customers | `/admin/customers` | CRUD for customers + contacts |
| Users | `/admin/users` | Create/edit/delete users via `manage-user` Edge Function |
| Vehicles | `/admin/vehicles` | CRUD for company vehicles + default rates |
| Classifications | `/admin/classifications` | Labor rate classes |
| Settings | `/admin/settings` | Company-level settings (placeholder) |

---

## Tech (Field) Pages

| Page | Path | Purpose |
|---|---|---|
| My Tickets | `/tickets` | List own tickets; trash icon on drafts |
| New Ticket | `/tickets/new` | Full ticket form (draft autosave) |
| Edit Ticket | `/tickets/:id/edit` | Edit draft or returned ticket |
| Ticket Detail | `/tickets/:id` | Read-only view; submit button; delete button (drafts) |

---

## Key UX Decisions

- **Time picker**: Custom Radix Select limited to 15-minute increments (00, 15, 30, 45). Native `<input type="time" step={900}>` does NOT restrict Chrome's dropdown UI.
- **Requestor field**: Free-text with a "Contacts" dropdown pill beside it that auto-populates the field when a contact is selected. Dropdown only appears when the selected customer has contacts.
- **Equipment section**: Hidden by default; enabled per-ticket with a toggle.
- **Photos**: Optional section; EXIF data preserved (GPS tags kept per user request).
- **Pricing visibility**: Pricing columns (`price_each`, `rate`, totals) are omitted entirely from the tech form and tech detail views.
- **Draft autosave**: Form state written to IndexedDB on every change; restored on re-open. Cleared on submit or discard.

---

## Notifications (planned)

| Trigger | Recipient | Channel |
|---|---|---|
| Ticket submitted | Admins with notification toggle ON | Email (SendGrid) + in-app |
| Ticket returned | Tech who owns it (opt-in) | Email (SendGrid) + in-app |

In-app notifications: a bell icon in the AppShell header; unread count badge; dropdown list. Notification rows stored in a `notifications` table. Real-time delivery via Supabase Realtime channel subscription.

---

## Multi-Tenant Scaffolding

Not a current-phase feature, but every table has a `company_id` column defaulting to the single Tradewind Controls row (`00000000-0000-0000-0000-000000000001`). RLS policies filter by `auth_company_id()`. A future tenant split is a data migration + new company row, not a code rewrite.

---

## Phases

### Phase 0 — Foundation (COMPLETE)
Project scaffolding, Supabase schema, initial migration, Vercel deployment, auth flow.

### Phase 1 — Tech Ticket Flow (COMPLETE)
Ticket form (create/edit), draft autosave, My Tickets list, Ticket Detail view, submit action.

### Phase 2 — Admin Setup Pages (COMPLETE)
Customers + contacts CRUD, Users CRUD (via Edge Function), Vehicles CRUD, Classifications CRUD, admin nav.

### Phase 3 — Admin Review (COMPLETE)
All Tickets list with filters, Ticket Review page with per-line pricing overrides, OT split, finalize/unfinalize/return actions, audit log, dashboard stat cards wired to live data.

### Phase 4 — QoL Improvements (COMPLETE)
Contact picker on requestor field, 15-min time increments, ticket deletion (tech: own drafts; admin: non-finalized), admin nav includes "My Tickets" link.

### Phase 5 — Customer Signatures (COMPLETE)
Canvas-based signature capture on ticket detail/edit pages. Stores PNG to Supabase Storage `ticket-signatures` bucket. On-site capture via `SignaturePad` component or remote capture via emailed signing link (48h expiry token). Signature displayed with signer name + timestamp. Clear & re-sign option. Signed badge on ticket list cards and detail headers. Signature image embedded in PDF exports. Notification prefs for `on_signed` event.

### Phase 6 — PDF / XLSX Export (COMPLETE — PDF only)
Client-side PDF generation via `jsPDF`. Ticket data rendered with signature images (fetched via signed storage URLs). Admin review page Export PDF button (gated to finalized tickets only). Pricing completeness required before finalize.

### Phase 7 — Notifications (COMPLETE)
SendGrid integration for immediate emails + daily digest. In-app notification system using Supabase Realtime. Per-event email preferences (off / immediate / daily digest) for both admins and techs. Configurable digest hour. Branded email templates matching Tradewind Controls website identity. Bell icon + unread badge in AppShell header. Test email delivery feature.

### Phase 8 — Admin Enhancements (COMPLETE)
User management: disable/re-enable users. Update available banner (polls version.json). Finalize gated on pricing completeness. Sidebar cleanup. App branding on all outgoing emails (gradient accent bar, TRADEWIND TICKETS text logo, branded footer).

### Phase 9 — App Branding (COMPLETE)
Applied the Tradewind Controls brand identity across the app UI to match the emails shipped in Phase 8:
- New primary color theme (Dodger Blue `#1d90ff`, navy `#0a1e3d`, cyan `#00d4ff` accent)
- Montserrat (display) + Libre Franklin (body) via Google Fonts
- Custom geometric TradewindLogo SVG + Wordmark component with navy→cyan→blue gradient
- Signature 3px gradient accent bar on sidebar, auth cards, mobile header, KPI cards
- Rebuilt login / forgot-password / reset-password pages with blueprint grid + atmospheric glow
- Sidebar redesigned with active-nav cyan stripe treatment, mist-tinted user card
- New favicon.svg + PWA manifest.json with navy theme color
- Photo count + signed status badges now visible on all ticket list cards
- Activity Log moved to bottom of ticket review (after photos/signature)
- Original theme preserved at `src/themes/default-backup/` for easy revert

### Phase 10 — Admin Reports (COMPLETE)
Dedicated `/admin/reports` page for aggregate ticket analytics:
- Filter bar: date range (with presets: This Week / This Month / Last Month / This Quarter / YTD), multi-select customer, multi-select technician, status chip toggles
- 4 KPI cards: Tickets, Grand Total, Total Hours, Active Techs
- Status Mix strip with colored badges
- Hours-by-Technician × Week grid with per-row and per-column totals, overtime (>40h) highlighting
- Filtered ticket table (click row → ticket review)
- Filters serialized to URL query string for shareable links
- Client-side aggregation via `src/lib/reportUtils.ts` (pure helpers) + `src/hooks/useReports.ts`
- New `MultiSelect` primitive at `src/components/MultiSelect.tsx` for compact multi-value filters

### Phase 11 — Polish (NEXT)
- **PWA install prompt** — actual install prompt UX on top of the manifest already shipped in Phase 9.
- **Service worker for asset caching** — offline-first shell, background sync.
- **Offline draft hardening** — retry queue on reconnect for ticket saves and photo uploads.
- **Accessibility audit** — keyboard nav, ARIA labels, focus management, color contrast.
- **Bundle code-splitting** — route-level `React.lazy()` + lazy-load heavy libs like `jsPDF`.
- **Lighthouse score targets** — set goals for Performance / Accessibility / Best Practices / SEO and fix flagged issues.

---

## Backlog / Known Issues

- [ ] **Permanent user delete** — Implemented in manage-user edge function (`permanent_delete` action) + UI (`PermanentDeleteDialog` in AdminUsersPage, currently hidden). Fails due to Postgres FK cascade conflicts with RLS policies. Error: `referential integrity query on "profiles" from constraint "ticket_audit_log_actor_id_fkey" gave unexpected result — due to a rule having rewritten the query.` Fix: either manually nullify ALL FK references before deleting (bypassing cascade entirely), or create a `SECURITY DEFINER` Postgres function that temporarily disables RLS on affected tables during the delete.
- [ ] **XLSX single-ticket export button** — `src/lib/exportTicketXlsx.ts` is implemented but not wired to any UI. Needs an "Export XLSX" button alongside the existing "Export PDF" on the admin ticket review page.
- [ ] **Reports: PDF export** — export the filtered Reports view (KPIs + hours grid + ticket table) as a single PDF. User confirmed this is secondary to the on-screen visualization (which shipped in Phase 10).
- [ ] **Reports: bulk PDF export** — export a filtered set of tickets as a ZIP of per-ticket PDFs. Useful for sending a batch to a customer.
- [ ] **Camera photo upload placeholder** — placeholder doesn't survive the native camera round-trip on Android. SessionStorage + `visibilitychange` approach attempted but unreliable. Possible fixes: in-app camera via `getUserMedia`, service worker coordination, or top-level toast outside the component tree.
- [ ] **Camera photo upload placeholder** — The "Processing photo…" placeholder works for gallery file picks but not for camera captures on mobile. SessionStorage persistence and visibilitychange listeners were attempted but the placeholder still doesn't survive the native camera round-trip on Android. The current implementation is in `PhotoUploader.tsx` (`cameraPending` state + `sessionStorage`). Root cause likely: the browser fully reconstructs the page (not just suspends it) when returning from the camera intent, and the hidden `<input>` onChange takes 20-45s to fire. Possible approaches: (1) move to a `BroadcastChannel`/`ServiceWorker` approach, (2) use a fullscreen in-app camera via `getUserMedia` instead of the native camera intent, (3) accept the delay and just show a top-level toast/banner outside the component tree.
