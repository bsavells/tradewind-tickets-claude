-- ── Notification digest: email_frequency pref, digest_hour on profiles, digest queue ──

-- 1. Add email_frequency to notification_prefs
--    'immediate' = send right away (existing behaviour)
--    'digest'    = batch into daily digest email
--    'off'       = no email at all
ALTER TABLE notification_prefs
  ADD COLUMN email_frequency text NOT NULL DEFAULT 'immediate'
  CHECK (email_frequency IN ('off', 'immediate', 'digest'));

-- Migrate rows where email was previously disabled → 'off'
UPDATE notification_prefs SET email_frequency = 'off' WHERE NOT email_enabled;

-- 2. Add digest_hour to profiles (0-23, Central Time; default 17 = 5 PM CT)
ALTER TABLE profiles
  ADD COLUMN digest_hour integer NOT NULL DEFAULT 17
  CHECK (digest_hour >= 0 AND digest_hour <= 23);

-- 3. Digest queue: one row per pending digest email item
--    Edge function inserts here when email_frequency = 'digest'.
--    The send-digest function reads, emails, then deletes processed rows.
CREATE TABLE notification_digest_queue (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  recipient_id  uuid        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  ticket_number text        NOT NULL,
  kind          text        NOT NULL,
  title         text        NOT NULL,
  body          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_digest_queue ENABLE ROW LEVEL SECURITY;

-- Users can read their own queue (mainly for debugging; not shown in UI)
CREATE POLICY "users can view own digest queue"
  ON notification_digest_queue FOR SELECT
  USING (recipient_id = auth.uid());

-- ── pg_cron setup (run in Supabase SQL editor after enabling pg_cron extension) ──
-- Replace <SERVICE_ROLE_KEY> and the project URL before running.
--
-- SELECT cron.schedule(
--   'send-digest-hourly',
--   '0 * * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://rvczzujbzfsbljbajjgp.supabase.co/functions/v1/send-digest',
--     headers := jsonb_build_object(
--       'Content-Type',  'application/json',
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--     ),
--     body    := '{}'::jsonb
--   )
--   $$
-- );
