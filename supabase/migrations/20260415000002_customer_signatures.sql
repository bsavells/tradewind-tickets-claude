-- ── Customer Signatures ──────────────────────────────────────────────────────
-- 1. signature_tokens — one-time tokens for remote signing links
create table signature_tokens (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references tickets(id) on delete cascade,
  token         uuid not null default gen_random_uuid() unique,
  requested_by  uuid not null references profiles(id),
  expires_at    timestamptz not null,
  used_at       timestamptz
);

create index idx_signature_tokens_ticket_id on signature_tokens(ticket_id);

-- All access is via Edge Functions with service role (bypasses RLS).
-- Enable RLS so anon/authenticated users cannot access directly.
alter table signature_tokens enable row level security;

-- 2. is_signed — denormalised flag for fast list queries
alter table tickets add column is_signed boolean not null default false;

-- 3. Trigger: flip is_signed when a customer signature row is inserted
create or replace function update_ticket_is_signed()
returns trigger language plpgsql security definer as $$
begin
  if new.kind = 'customer' then
    update tickets set is_signed = true where id = new.ticket_id;
  end if;
  return new;
end;
$$;

create trigger on_customer_signature_insert
  after insert on ticket_signatures
  for each row execute function update_ticket_is_signed();

-- Also handle upsert (on update, re-fire is_signed = true)
create trigger on_customer_signature_update
  after update on ticket_signatures
  for each row execute function update_ticket_is_signed();

-- 4. ticket-signatures Storage bucket (may already exist — skip if so)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-signatures',
  'ticket-signatures',
  false,
  5242880,          -- 5 MB max per signature PNG
  array['image/png']
)
on conflict (id) do nothing;

-- Storage RLS: authenticated company members can read/write their own signatures
create policy "ticket-signatures select" on storage.objects
  for select using (
    bucket_id = 'ticket-signatures'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (auth_company_id())::text
  );

create policy "ticket-signatures insert" on storage.objects
  for insert with check (
    bucket_id = 'ticket-signatures'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (auth_company_id())::text
  );

create policy "ticket-signatures update" on storage.objects
  for update using (
    bucket_id = 'ticket-signatures'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (auth_company_id())::text
  );
-- Service role (edge functions) bypasses RLS for remote signature uploads.
