-- ============================================================
-- In-app notifications table
-- ============================================================
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  ticket_id    uuid references tickets(id) on delete set null,
  kind         text not null,   -- 'ticket_submitted' | 'ticket_returned' | 'ticket_finalized'
  title        text not null,
  body         text,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table notifications enable row level security;

-- Users can see their own notifications
create policy "notifications_select_own" on notifications
  for select using (recipient_id = auth.uid());

-- Users can mark their own notifications as read (update only)
create policy "notifications_update_own" on notifications
  for update using (recipient_id = auth.uid());

-- Enable realtime for live bell badge updates
alter publication supabase_realtime add table notifications;

-- ============================================================
-- Allow writable admins to manage notification_prefs for any
-- user in their company (e.g. pre-configuring notification
-- defaults or adjusting on behalf of a user)
-- ============================================================
create policy "notification_prefs_admin" on notification_prefs
  for all using (
    is_writable_admin()
    and exists (
      select 1 from profiles p
      where p.id = notification_prefs.user_id
        and p.company_id = auth_company_id()
    )
  );
