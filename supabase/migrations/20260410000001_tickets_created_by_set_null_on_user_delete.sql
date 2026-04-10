-- Allow users to be deleted while preserving their tickets.
-- created_by becomes NULL when the user is removed; the tech's
-- name is still captured in ticket_labor (first_name / last_name snapshots).

ALTER TABLE tickets
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE tickets
  DROP CONSTRAINT tickets_created_by_fkey;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
