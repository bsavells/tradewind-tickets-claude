-- One-time backfill: recompute grand_total from child rows for every ticket.
--
-- Some tickets had stale grand_totals because the admin pricing update path
-- fires multiple parallel UPDATEs against ticket_labor / ticket_vehicles /
-- ticket_materials. Each UPDATE's AFTER trigger calls
-- recompute_ticket_grand_total(), but those parallel transactions can read
-- stale snapshots of the other tables, so the last writer can persist a
-- partial sum. The client now also calls recompute_ticket_grand_total()
-- explicitly after all updates settle, but we still need to fix the rows
-- that were saved before the fix.
--
-- This backfill does NOT flip has_post_finalize_changes — it's a calculation
-- correction, not an admin edit.
UPDATE tickets t
SET grand_total = sub.new_total
FROM (
  SELECT
    t2.id,
    COALESCE((SELECT SUM(total)     FROM ticket_materials  WHERE ticket_id = t2.id), 0)
    + COALESCE((SELECT SUM(row_total) FROM ticket_labor    WHERE ticket_id = t2.id), 0)
    + COALESCE((SELECT SUM(total)     FROM ticket_vehicles  WHERE ticket_id = t2.id), 0)
    + COALESCE((SELECT SUM(total)     FROM ticket_equipment WHERE ticket_id = t2.id), 0) AS new_total
  FROM tickets t2
) sub
WHERE t.id = sub.id
  AND t.grand_total IS DISTINCT FROM sub.new_total;
