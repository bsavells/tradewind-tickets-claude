-- Track signature lifecycle in the audit log so we can show a "ticket edited
-- since last signature" banner with a useful reason in the re-sign UI.
--
-- `signature_captured`: a customer signature was added (note carries the
--                       admin/tech-supplied reason if the sign was a re-sign).
-- `signature_cleared`:  a signature was invalidated, either explicitly via the
--                       Clear button or automatically when an edit changed
--                       a billing-relevant field on a signed ticket. The
--                       `note` field carries a human-readable summary of
--                       what changed.
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'signature_cleared';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'signature_captured';
