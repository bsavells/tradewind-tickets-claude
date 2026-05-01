-- Allow each labor row to be entered as either a clocked shift
-- (start_time + end_time) or as flat hours (no times, just a manual hours value).
-- Default to 'clock' so existing rows and existing client code keep working.
ALTER TABLE public.ticket_labor
  ADD COLUMN entry_mode text NOT NULL DEFAULT 'clock'
  CHECK (entry_mode IN ('clock', 'flat'));

COMMENT ON COLUMN public.ticket_labor.entry_mode IS
  'How this row''s hours were entered: ''clock'' uses start_time/end_time to compute hours; ''flat'' stores hours directly with start_time/end_time NULL.';
