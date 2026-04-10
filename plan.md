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

### Phase 5 — Customer Signatures (NEXT)
Canvas-based signature capture on ticket detail page using `signature_pad`. Stores PNG to Supabase Storage `ticket-signatures` bucket. Two signature slots: customer (tech-captured) and supervisor (optional). Signature displayed on ticket detail/review. Signed-at timestamp auto-captured.

### Phase 6 — PDF / XLSX Export
Supabase Edge Function `export-ticket`. PDF via headless Chromium rendering a styled HTML ticket template. XLSX via `exceljs` mimicking the Excel ticket layout. Exports stored in `ticket-exports` bucket. Signed download URL returned. Admin review page gets Export button (PDF + XLSX). Exports logged to audit trail.

### Phase 7 — Notifications
SendGrid integration for email. In-app notification system using Supabase Realtime. Admin toggle for submission emails. Tech opt-in for return notifications. Bell icon + unread badge in AppShell header.

### Phase 8 — Polish
PWA install prompt + manifest, service worker for asset caching, offline draft hardening (retry queue on reconnect), accessibility audit (keyboard nav, ARIA labels, focus management), bundle code-splitting, Lighthouse score targets.
