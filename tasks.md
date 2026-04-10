# Tradewind Tickets — Task List

Legend: `[x]` = complete, `[ ]` = pending

---

## Phase 0 — Foundation

- [x] Initialize Vite + React 18 + TypeScript project
- [x] Configure Tailwind CSS v4
- [x] Install and configure shadcn/ui (Radix UI)
- [x] Set up React Router v6
- [x] Set up TanStack Query
- [x] Create Supabase project (`rvczzujbzfsbljbajjgp`)
- [x] Write and apply initial schema migration (all tables, RLS, functions)
- [x] Configure Supabase Auth (email + password)
- [x] Create Supabase Storage buckets: `ticket-signatures`, `ticket-photos`, `ticket-exports`
- [x] Set up Vercel project and connect GitHub repo (`main` → auto-deploy)
- [x] Configure Vercel env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`)
- [x] Configure `.env.local` with Supabase and SendGrid keys
- [x] Create `AuthContext` (session, profile, role helpers)
- [x] Build `LoginPage` and `ForgotPasswordPage`
- [x] Build `ProtectedRoute` and `RootRedirect` (role-based redirect on login)
- [x] Build `AppShell` with sidebar nav (tech + admin variants)
- [x] Save dev server configs to `.claude/launch.json`

---

## Phase 1 — Tech Ticket Flow

- [x] Create `useTickets` hook (list, detail, create, update, submit mutations)
- [x] Create `useCustomers` hook
- [x] Create `useVehicles` hook
- [x] Create `useClassifications` hook
- [x] Build `MyTicketsPage` (list own tickets, status badges, click-through)
- [x] Build `TicketFormPage` — header section (customer, requestor, job #, location, problem, date, type)
- [x] Build `TicketFormPage` — materials section (dynamic rows, add/remove)
- [x] Build `TicketFormPage` — labor section (dynamic rows, add/remove, time pickers)
- [x] Build `TicketFormPage` — vehicles section (dynamic rows, add/remove)
- [x] Build `TicketFormPage` — equipment section (dynamic rows, toggle to show/hide)
- [x] Custom `TimeSelect` component (15-minute increments: 00, 15, 30, 45)
- [x] Contact picker on requestor field (Radix Select pill populated from customer contacts)
- [x] Build `TicketDetailPage` (read-only view, submit button, status display)
- [x] `useDraftAutosave` hook — write form state to IndexedDB on change, restore on re-open
- [x] Auto-clear draft from IndexedDB on submit or discard
- [x] Apply DB triggers for computed totals (`ticket_totals_triggers` migration)
  - [x] `recompute_ticket_grand_total` function (`SECURITY DEFINER`)
  - [x] `child_row_after_change` trigger function (`SECURITY DEFINER`, INSERT/UPDATE only)
  - [x] BEFORE INSERT/UPDATE triggers on each child table for row-level computation
  - [x] AFTER INSERT/UPDATE triggers on each child table calling grand total recompute

---

## Phase 2 — Admin Setup Pages

- [x] Build `AdminCustomersPage` (list + create + edit + delete customers)
- [x] Build customer contacts sub-section (list + create + edit + delete contacts per customer)
- [x] Build `AdminUsersPage` (list all users from profiles)
- [x] Deploy `manage-user` Supabase Edge Function (`verify_jwt: false`, internal auth check)
  - [x] `action: 'create'` — create auth user + set profile + send password reset
  - [x] `action: 'delete'` — delete auth user + profile
  - [x] `action: 'send_reset'` — send password reset email
- [x] `useCreateUser`, `useDeleteUser`, `useSendPasswordReset` hooks (via Edge Function)
- [x] Create User dialog with role/name/email fields
- [x] Edit User dialog with Send Reset button
- [x] Delete User confirm dialog (prevents self-deletion)
- [x] Build `AdminVehiclesPage` (list + create + edit + delete vehicles)
- [x] Build `AdminClassificationsPage` (list + create + edit + delete classifications)
- [x] Add admin nav entry for "My Tickets" so admins can create tickets

---

## Phase 3 — Admin Review

- [x] `useTicketStats` hook (parallel count queries: pending, finalized this month, drafts, total)
- [x] Wire `AdminDashboardPage` stat cards to live data
- [x] Pending tickets feed on dashboard (top 10 submitted, clickable rows)
- [x] Build `AdminTicketsPage` (all tickets, status filter pills, search, clickable rows)
- [x] Build `AdminTicketReviewPage`
  - [x] Read all ticket sections (materials, labor, vehicles, equipment, audit log)
  - [x] Editable pricing fields per line (price_each, rates, reg/OT hours)
  - [x] Live grand total computed from local state (`useMemo`)
  - [x] OT/Reg hours auto-balance when either field is edited
  - [x] "Save Pricing" action (only shown when dirty) via `useAdminUpdateTicketPricing`
  - [x] "Return to Tech" action with optional note
  - [x] "Finalize" action with confirm dialog
  - [x] "Unfinalize" action with confirm dialog
  - [x] "Delete" action (non-finalized tickets, confirm dialog)
  - [x] Audit log display (timeline of all actions)
- [x] `useFinalizeTicket`, `useUnfinalizeTicket`, `useReturnTicket` mutations
- [x] Add `/admin/tickets/:id` route in `App.tsx`

---

## Phase 4 — QoL Improvements

- [x] Ticket deletion for techs (own draft tickets — trash icon on My Tickets list + button on detail page)
- [x] Ticket deletion for admins (non-finalized tickets — button on review page)
- [x] `delete_ticket_safe` Postgres RPC function (`SECURITY DEFINER`, manual child row deletion to avoid RLS/CASCADE conflict)
- [x] RLS DELETE policies on all child tables (ticket_materials, ticket_labor, ticket_vehicles, ticket_equipment, ticket_audit_log, ticket_photos, ticket_signatures, ticket_exports)
- [x] Change `ticket_audit_log_ticket_id_fkey` from CASCADE to RESTRICT (fixes Postgres RI check conflict)
- [x] Remove DELETE event from child table AFTER triggers (prevents UPDATE-on-tickets-during-delete RI conflict)

---

## Phase 5 — Customer Signatures (NEXT)

- [ ] Install `signature_pad` package
- [ ] Create `SignatureCanvas` component (wraps `signature_pad`, clear button, save button)
- [ ] Add customer signature section to `TicketDetailPage` (tech captures on mobile)
- [ ] Upload signature PNG to `ticket-signatures` Supabase Storage bucket on save
- [ ] Insert row into `ticket_signatures` table (`role: 'customer'`, `signed_at`, `signer_name`)
- [ ] Display saved customer signature image on `TicketDetailPage` and `AdminTicketReviewPage`
- [ ] Add supervisor signature section to `AdminTicketReviewPage` (optional)
- [ ] Upload supervisor signature PNG to `ticket-signatures` bucket
- [ ] Insert row into `ticket_signatures` table (`role: 'supervisor'`)
- [ ] Display supervisor signature on review page once captured
- [ ] Include both signatures in the PDF export template (Phase 6)

---

## Phase 6 — PDF / XLSX Export

- [ ] Design HTML ticket template (mirrors Excel layout: header, materials, labor, vehicles, equipment, signatures, grand total)
- [ ] Deploy `export-ticket` Supabase Edge Function
  - [ ] `format: 'pdf'` path — render HTML template with headless Chromium, store to `ticket-exports` bucket
  - [ ] `format: 'xlsx'` path — build workbook with `exceljs`, store to `ticket-exports` bucket
  - [ ] Write `ticket_exports` row on each export
  - [ ] Write `exported` entry to `ticket_audit_log`
  - [ ] Return signed URL (60-second expiry)
- [ ] Add Export PDF and Export XLSX buttons to `AdminTicketReviewPage`
- [ ] Show export history (timestamp + who exported) on review page
- [ ] Add export access for readonly admins
- [ ] Display `has_post_finalize_changes` warning badge near export buttons ("pricing changed since last export")

---

## Phase 7 — Notifications

- [ ] Create `notifications` table (recipient_id, ticket_id, type, message, read_at, created_at)
- [ ] RLS policies on `notifications` (user sees own; admin inserts on submission)
- [ ] Bell icon + unread count badge in `AppShell` header
- [ ] Notification dropdown (list of unread + recent, mark-as-read on click)
- [ ] Supabase Realtime subscription for live notification delivery in `AppShell`
- [ ] Admin notification toggle (per-user setting: email on new submission)
- [ ] Tech opt-in toggle (per-user setting: email when ticket returned)
- [ ] SendGrid email on ticket submitted → notify admins with toggle ON
  - [ ] Email includes ticket number, tech name, customer, work date, link to review page
- [ ] SendGrid email on ticket returned → notify ticket owner if opted in
  - [ ] Email includes ticket number, admin note (if any), link to edit page
- [ ] Write `notifications` row in-app alongside every SendGrid send
- [ ] Mark notifications read when user clicks through to the ticket

---

## Phase 8 — Polish

- [ ] PWA manifest (`manifest.json` — name, icons, theme color, display: standalone)
- [ ] Service worker for asset caching (Vite PWA plugin)
- [ ] PWA install prompt component (shows after first use, dismissible)
- [ ] Offline draft hardening — detect network loss; show banner; queue submit retry on reconnect
- [ ] Submit retry queue using `idb-keyval` (persist pending submits across page reloads)
- [ ] Accessibility audit — keyboard navigation through all forms
- [ ] ARIA labels on icon-only buttons (trash, edit, add row)
- [ ] Focus management in dialogs (trap focus, restore on close)
- [ ] React lazy + Suspense code-splitting (admin pages, ticket form)
- [ ] Lighthouse score targets: Performance ≥ 90, Accessibility ≥ 95, PWA ✓
- [ ] Production deployment review (env vars, Supabase Pro tier, SendGrid domain auth)

---

## Backlog / Future

- [ ] Multi-tenant: add second company, migrate data, test RLS isolation
- [ ] Readonly admin export access via role gate (UI polish pass)
- [ ] Photo attachments — upload section on ticket form (camera capture on mobile)
  - [ ] Server-side thumbnail generation (Edge Function)
  - [ ] EXIF data preserved on storage
  - [ ] Photo gallery on ticket detail + review pages
- [ ] In-app ticket search (global search across all fields)
- [ ] Reporting / analytics page for admins (labor hours by tech, revenue by customer, etc.)
- [ ] Admin Settings page (company name, logo, default rates, notification preferences)
- [ ] Bulk finalize action on All Tickets page
- [ ] Customer portal (read-only view of finalized tickets for customers) — aspirational
