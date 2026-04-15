# Notification Preferences Expansion — Design

**Date:** 2026-04-14
**Status:** Approved (brainstorming)

## Problem

The notification preferences system has two structural gaps:

1. **Redundant in-app toggle.** In-app notifications are non-invasive (a bell dot). Letting users turn them off adds UI complexity without real user value.
2. **Missing ticket events.** Admin `on_submit` pref conflates two distinct events (new submission vs. return request). Tech `on_delete` event exists in the edge function but has no user-facing pref — it always fires.

Additionally, email template polish is deferred to a later "brand design" phase and is **not in scope** for this spec.

## Goals

- Remove in-app toggle from the preferences UI (in-app is always on)
- Split and expand pref keys so every user-facing event has its own Off/Immediate/Digest selector
- Keep data model backward compatible — no destructive migrations

## Out of Scope

- Visual redesign of immediate/digest email templates (deferred to brand phase)
- Brand system work (logo refresh, color tokens, typography)
- SMS / push notification channels

## Event → Pref Key Mapping

| Event (`event_kind`) | Recipient | Pref key (new) | Pref key (old) |
|---|---|---|---|
| `ticket_submitted` | Admins | `on_submit` | `on_submit` |
| `ticket_return_requested` | Admins | `on_return_request` | `on_submit` (shared) |
| `ticket_returned` | Ticket creator | `on_return` | `on_return` |
| `ticket_finalized` | Ticket creator | `on_finalize` | `on_finalize` |
| `ticket_deleted` | Ticket creator | `on_delete` | *(always fires, no pref)* |

## Preferences UI (`NotificationPrefsPage.tsx`)

**Admin prefs:**
- `on_submit` — "New ticket submitted" — "When a technician submits a ticket for review."
- `on_return_request` — "Return requested on finalized ticket" — "When a technician requests that a finalized ticket be reopened for edits."

**Tech prefs:**
- `on_return` — "Ticket returned for revision" — "When an admin returns one of your tickets."
- `on_finalize` — "Ticket finalized" — "When an admin finalizes one of your tickets."
- `on_delete` — "Ticket deleted" — "When an admin deletes one of your tickets."

Each row shows:
- Label + description
- 3-way Off / Immediate / Daily Digest selector
- (In-app Switch removed)

Daily digest time picker and test email button are unchanged.

## Per-User Admin Controls (`AdminUsersPage.tsx` — EditUserDialog)

The `NOTIF_PREFS` array and the row layout both update:

- Remove in-app Switch column
- Convert email Switch to the 3-way selector (reuse `FreqSelector` component, or lift it to a shared location)
- Include all 5 keys, filtered by user role:
  - Admin role → show `on_submit`, `on_return_request`
  - User role → show `on_return`, `on_finalize`, `on_delete`

Admins editing other users' prefs get the same controls as users editing their own.

## Edge Function Changes (`notify-ticket-event/index.ts`)

1. **`ticket_return_requested` branch** — change pref lookup from `key = 'on_submit'` to `key = 'on_return_request'`.
2. **`ticket_deleted` branch** — replace the hard-coded always-fires logic with a `processRecipient` call using pref key `on_delete`. Follows the same Off/Immediate/Digest flow as other events.
3. **`processRecipient` helper** — stop reading `pref.in_app_enabled`. Always push the in-app row (equivalent to `inAppDefault = true` for all paths).

## Hooks (`useNotifications.ts`)

`useUpsertNotificationPref` currently writes both `in_app_enabled` and `email_frequency`. Keep both writes for DB compatibility but always pass `in_app_enabled: true`. Remove `in_app_enabled` from the mutation's input type.

## Data Model

**No migration required.** Keep the `in_app_enabled` column on `notification_prefs` for backward compatibility. It becomes inert (always `true` going forward). Existing `on_submit` rows continue to work for `ticket_submitted`; users with `on_return_request` prefs get a fresh default ('immediate') on first use per the existing `DEFAULT_FREQUENCY` fallback in `resolveFrequency`.

## Migration / Rollout

Ship as a single deploy:
1. Update `notify-ticket-event` edge function (Supabase)
2. Ship frontend (Vercel)

No data migration — existing users continue with their `on_submit` setting for new submissions. For the new `on_return_request` and `on_delete` keys, the default (`immediate`) applies until the user overrides it. This is acceptable because:
- `on_return_request` is rare and low-volume
- `on_delete` is rare and users generally want to know when their work disappears

## Testing

1. Admin pref page renders 2 rows (`on_submit`, `on_return_request`), no in-app toggle
2. Tech pref page renders 3 rows (`on_return`, `on_finalize`, `on_delete`), no in-app toggle
3. AdminUsersPage → EditUserDialog for a User shows 3 prefs with 3-way selector
4. AdminUsersPage → EditUserDialog for an Admin shows 2 prefs with 3-way selector
5. `ticket_return_requested` event with `on_return_request` = 'off' → admin gets no email
6. `ticket_deleted` event with `on_delete` = 'off' → tech gets no email (but still gets in-app)
7. Digest: submit 3 tickets with admin `on_submit` = 'digest' and request return on one with `on_return_request` = 'digest' → single digest email with two sections

## Open Questions

None. User approved event list and in-app removal on 2026-04-14.
