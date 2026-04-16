# Tradewind Tickets — TODO

## Backlog

- [ ] **Permanent user delete** — The "Permanently Delete User" feature in the admin panel is implemented (manage-user edge function `permanent_delete` action + UI in AdminUsersPage with `PermanentDeleteDialog`) but fails due to Postgres FK cascade conflicts with RLS policies. The error is: `referential integrity query on "profiles" from constraint "ticket_audit_log_actor_id_fkey" on "ticket_audit_log" gave unexpected result — This is most likely due to a rule having rewritten the query.` Manually nullifying `ticket_audit_log.actor_id` before deleting didn't fully resolve it — other RLS-protected tables may have the same issue. The UI button is currently hidden. Investigate: either manually nullify ALL FK references before deleting (bypassing cascade entirely), or temporarily disable RLS on affected tables during the delete operation using a Postgres function with `SECURITY DEFINER`.
