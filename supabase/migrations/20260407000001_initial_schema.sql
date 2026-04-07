-- ============================================================
-- Tradewind Tickets — Initial Schema
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

create type user_role as enum ('tech', 'admin');
create type ticket_status as enum ('draft', 'submitted', 'returned', 'finalized');
create type export_format as enum ('pdf', 'xlsx');
create type signature_kind as enum ('customer', 'supervisor');
create type audit_action as enum (
  'created', 'edited', 'submitted',
  'return_requested', 'returned', 'edited_by_admin',
  'finalized', 'unfinalized', 'exported'
);

-- ============================================================
-- COMPANIES (multi-tenant scaffold)
-- ============================================================

create table companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Seed Tradewind Controls as the default company
insert into companies (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Tradewind Controls');

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================

create table profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  company_id            uuid not null references companies(id),
  email                 text not null,
  first_name            text not null default '',
  last_name             text not null default '',
  role                  user_role not null default 'tech',
  is_readonly_admin     boolean not null default false,
  classification_id     uuid,  -- fk added after classifications table
  default_vehicle_id    uuid,  -- fk added after vehicles table
  notification_on_return boolean not null default true,
  active                boolean not null default true,
  created_at            timestamptz not null default now()
);

-- Auto-create profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, company_id, email)
  values (
    new.id,
    '00000000-0000-0000-0000-000000000001',
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- CLASSIFICATIONS
-- ============================================================

create table classifications (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id),
  name               text not null,
  default_reg_rate   numeric(10,2) not null default 0,
  default_ot_rate    numeric(10,2) not null default 0,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

-- Seed default classifications
insert into classifications (company_id, name, default_reg_rate, default_ot_rate) values
  ('00000000-0000-0000-0000-000000000001', 'Sr. Tech', 125.00, 187.50),
  ('00000000-0000-0000-0000-000000000001', 'Jr. Tech', 85.00, 127.50);

-- ============================================================
-- VEHICLES
-- ============================================================

create table vehicles (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id),
  label                 text not null,
  description           text,
  default_mileage_rate  numeric(10,2) not null default 0,
  assigned_user_id      uuid references profiles(id) on delete set null,
  active                boolean not null default true,
  created_at            timestamptz not null default now()
);

-- Seed vehicles from the example ticket
insert into vehicles (company_id, label, default_mileage_rate) values
  ('00000000-0000-0000-0000-000000000001', '(1)', 1.95),
  ('00000000-0000-0000-0000-000000000001', '(2)', 1.95);

-- Add deferred FKs to profiles now that both tables exist
alter table profiles
  add constraint profiles_classification_id_fkey
    foreign key (classification_id) references classifications(id) on delete set null,
  add constraint profiles_default_vehicle_id_fkey
    foreign key (default_vehicle_id) references vehicles(id) on delete set null;

-- ============================================================
-- CUSTOMERS
-- ============================================================

create table customers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  name        text not null,
  address     text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table customer_contacts (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  name         text not null,
  phone        text,
  email        text,
  title        text,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- TICKET NUMBER SEQUENCES
-- ============================================================

create table ticket_number_sequences (
  company_id  uuid not null references companies(id),
  year        int not null,
  next_value  int not null default 1,
  primary key (company_id, year)
);

-- Function to claim the next ticket number atomically
create or replace function next_ticket_number(p_company_id uuid)
returns text language plpgsql as $$
declare
  v_year    int := extract(year from now());
  v_seq     int;
  v_prefix  text;
begin
  insert into ticket_number_sequences (company_id, year, next_value)
  values (p_company_id, v_year, 2)
  on conflict (company_id, year) do update
    set next_value = ticket_number_sequences.next_value + 1
  returning next_value - 1 into v_seq;

  v_prefix := 'TW-' || lpad((v_year % 100)::text, 2, '0');
  return v_prefix || '-' || lpad(v_seq::text, 5, '0');
end;
$$;

-- ============================================================
-- TICKETS
-- ============================================================

create table tickets (
  id                        uuid primary key default gen_random_uuid(),
  company_id                uuid not null references companies(id),
  ticket_number             text not null,
  customer_id               uuid not null references customers(id),
  requestor                 text not null default '',
  job_number                text,
  job_location              text,
  job_problem               text,
  ticket_type               text,
  work_date                 date not null default current_date,
  work_description          text,
  equipment_enabled         boolean not null default false,
  status                    ticket_status not null default 'draft',
  created_by                uuid not null references profiles(id),
  grand_total               numeric(12,2) not null default 0,
  finalized_at              timestamptz,
  finalized_by              uuid references profiles(id) on delete set null,
  has_post_finalize_changes boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint ticket_number_unique unique (company_id, ticket_number)
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tickets_updated_at
  before update on tickets
  for each row execute procedure update_updated_at();

-- ============================================================
-- TICKET LINE ITEMS
-- ============================================================

create table ticket_materials (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references tickets(id) on delete cascade,
  sort_order   int not null default 0,
  qty          numeric(10,2) not null default 1,
  part_number  text,
  description  text,
  price_each   numeric(10,2),  -- admin-only
  total        numeric(10,2)   -- admin-only, computed
);

create table ticket_labor (
  id                       uuid primary key default gen_random_uuid(),
  ticket_id                uuid not null references tickets(id) on delete cascade,
  sort_order               int not null default 0,
  user_id                  uuid references profiles(id) on delete set null,
  first_name               text not null default '',
  last_name                text not null default '',
  classification_snapshot  text,
  start_time               time,
  end_time                 time,
  hours                    numeric(6,2),  -- total hours (tech-entered from start/end)
  reg_hours                numeric(6,2),  -- admin-split
  ot_hours                 numeric(6,2),  -- admin-split
  reg_rate                 numeric(10,2), -- auto-populated, admin can override
  ot_rate                  numeric(10,2), -- admin-only
  reg_total                numeric(10,2), -- computed
  ot_total                 numeric(10,2), -- computed
  row_total                numeric(10,2), -- computed

  constraint labor_hours_split_check
    check (reg_hours is null or ot_hours is null or (reg_hours + ot_hours = hours))
);

create table ticket_equipment (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references tickets(id) on delete cascade,
  sort_order   int not null default 0,
  equip_number text,
  hours        numeric(6,2),
  rate         numeric(10,2),
  total        numeric(10,2)
);

create table ticket_vehicles (
  id             uuid primary key default gen_random_uuid(),
  ticket_id      uuid not null references tickets(id) on delete cascade,
  sort_order     int not null default 0,
  vehicle_id     uuid references vehicles(id) on delete set null,
  vehicle_label  text,
  mileage_start  numeric(10,1),
  mileage_end    numeric(10,1),
  total_miles    numeric(10,1) generated always as (
    case when mileage_end is not null and mileage_start is not null
    then mileage_end - mileage_start else null end
  ) stored,
  rate           numeric(10,2), -- auto-populated, admin can override
  total          numeric(10,2)  -- computed: total_miles * rate
);

create table ticket_photos (
  id             uuid primary key default gen_random_uuid(),
  ticket_id      uuid not null references tickets(id) on delete cascade,
  file_url       text not null,
  thumbnail_url  text,
  caption        text,
  uploaded_by    uuid not null references profiles(id) on delete set null,  -- intentionally allows null display but keeps record
  uploaded_at    timestamptz not null default now()
);

create table ticket_signatures (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references tickets(id) on delete cascade,
  kind          signature_kind not null,
  signer_name   text,
  signed_at     timestamptz not null default now(),
  image_url     text not null,

  constraint one_signature_per_kind unique (ticket_id, kind)
);

-- ============================================================
-- AUDIT LOG (append-only)
-- ============================================================

create table ticket_audit_log (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references tickets(id) on delete cascade,
  actor_id    uuid references profiles(id) on delete set null,
  actor_name  text,  -- snapshot in case user is later deleted
  action      audit_action not null,
  diff        jsonb,
  note        text,
  occurred_at timestamptz not null default now()
);

-- Prevent updates/deletes on audit log
create rule no_update_audit_log as on update to ticket_audit_log do instead nothing;
create rule no_delete_audit_log as on delete to ticket_audit_log do instead nothing;

-- ============================================================
-- EXPORTS
-- ============================================================

create table ticket_exports (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references tickets(id) on delete cascade,
  format        export_format not null,
  file_url      text not null,
  is_stale      boolean not null default false,
  generated_at  timestamptz not null default now(),
  generated_by  uuid not null references profiles(id) on delete set null
);

-- ============================================================
-- NOTIFICATION PREFS
-- ============================================================

create table notification_prefs (
  user_id         uuid not null references profiles(id) on delete cascade,
  key             text not null,  -- e.g. 'on_submit', 'on_return'
  email_enabled   boolean not null default true,
  in_app_enabled  boolean not null default true,
  primary key (user_id, key)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table companies               enable row level security;
alter table profiles                enable row level security;
alter table classifications         enable row level security;
alter table vehicles                enable row level security;
alter table customers               enable row level security;
alter table customer_contacts       enable row level security;
alter table tickets                 enable row level security;
alter table ticket_materials        enable row level security;
alter table ticket_labor            enable row level security;
alter table ticket_equipment        enable row level security;
alter table ticket_vehicles         enable row level security;
alter table ticket_photos           enable row level security;
alter table ticket_signatures       enable row level security;
alter table ticket_audit_log        enable row level security;
alter table ticket_exports          enable row level security;
alter table notification_prefs      enable row level security;
alter table ticket_number_sequences enable row level security;

-- Helper: get the current user's profile
create or replace function auth_profile()
returns profiles language sql security definer stable as $$
  select * from profiles where id = auth.uid() limit 1;
$$;

-- Helper: is current user an active admin?
create or replace function is_admin()
returns boolean language sql security definer stable as $$
  select role = 'admin' and active from profiles where id = auth.uid();
$$;

-- Helper: is current user a writable admin (not read-only)?
create or replace function is_writable_admin()
returns boolean language sql security definer stable as $$
  select role = 'admin' and active and not is_readonly_admin from profiles where id = auth.uid();
$$;

-- Helper: get current user's company_id
create or replace function auth_company_id()
returns uuid language sql security definer stable as $$
  select company_id from profiles where id = auth.uid();
$$;

-- ---- profiles ----
create policy "Users can view their own profile" on profiles
  for select using (id = auth.uid());

create policy "Admins can view all profiles in company" on profiles
  for select using (is_admin() and company_id = auth_company_id());

create policy "Writable admins can manage profiles" on profiles
  for all using (is_writable_admin() and company_id = auth_company_id());

create policy "Users can update their own profile" on profiles
  for update using (id = auth.uid());

-- ---- company-scoped lookup tables (admins manage, all can read) ----
create policy "Company members can read classifications" on classifications
  for select using (company_id = auth_company_id());
create policy "Writable admins manage classifications" on classifications
  for all using (is_writable_admin() and company_id = auth_company_id());

create policy "Company members can read vehicles" on vehicles
  for select using (company_id = auth_company_id());
create policy "Writable admins manage vehicles" on vehicles
  for all using (is_writable_admin() and company_id = auth_company_id());

create policy "Company members can read customers" on customers
  for select using (company_id = auth_company_id());
create policy "Writable admins manage customers" on customers
  for all using (is_writable_admin() and company_id = auth_company_id());

create policy "Company members can read customer_contacts" on customer_contacts
  for select using (
    exists (select 1 from customers c where c.id = customer_id and c.company_id = auth_company_id())
  );
create policy "Writable admins manage customer_contacts" on customer_contacts
  for all using (
    is_writable_admin() and
    exists (select 1 from customers c where c.id = customer_id and c.company_id = auth_company_id())
  );

-- ---- tickets ----
create policy "Techs can view own tickets" on tickets
  for select using (created_by = auth.uid());

create policy "Admins can view all company tickets" on tickets
  for select using (is_admin() and company_id = auth_company_id());

create policy "Techs can insert draft tickets" on tickets
  for insert with check (
    company_id = auth_company_id()
    and created_by = auth.uid()
    and status = 'draft'
  );

create policy "Techs can edit own draft/returned tickets" on tickets
  for update using (
    created_by = auth.uid()
    and status in ('draft', 'returned')
    and not is_admin()
  );

create policy "Techs can submit own tickets" on tickets
  for update using (
    created_by = auth.uid()
    and status in ('draft', 'returned')
  )
  with check (status = 'submitted');

create policy "Writable admins can update any company ticket" on tickets
  for update using (is_writable_admin() and company_id = auth_company_id());

-- ---- ticket child tables (inherit ticket access) ----
-- Macro helper used for each child table: select allowed if you can see the ticket
create policy "ticket_materials select" on ticket_materials
  for select using (
    exists (select 1 from tickets t where t.id = ticket_id
      and (t.created_by = auth.uid() or (is_admin() and t.company_id = auth_company_id())))
  );
create policy "ticket_materials write" on ticket_materials
  for all using (
    exists (select 1 from tickets t where t.id = ticket_id
      and (
        (t.created_by = auth.uid() and t.status in ('draft','returned'))
        or (is_writable_admin() and t.company_id = auth_company_id())
      ))
  );

create policy "ticket_labor select" on ticket_labor
  for select using (
    exists (select 1 from tickets t where t.id = ticket_id
      and (t.created_by = auth.uid() or (is_admin() and t.company_id = auth_company_id())))
  );
create policy "ticket_labor write" on ticket_labor
  for all using (
    exists (select 1 from tickets t where t.id = ticket_id
      and (
        (t.created_by = auth.uid() and t.status in ('draft','returned'))
        or (is_writable_admin() and t.company_id = auth_company_id())
      ))
  );

create policy "ticket_equipment select" on ticket_equipment
  for select using (
    exists (select 1 from tickets t where t.id = ticket_id
      and (t.created_by = auth.uid() or (is_admin() and t.company_id = auth_company_id())))
  );
create policy "ticket_equipment write" on ticket_equipment
  for all using (
    exists (select 1 from tickets t where t.id = ticket_id
      and (
        (t.created_by = auth.uid() and t.status in ('draft','returned'))
        or (is_writable_admin() and t.company_id = auth_company_id())
      ))
  );

create policy "ticket_vehicles select" on ticket_vehicles
  for select using (
    exists (select 1 from tickets t where t.id = ticket_id
      and (t.created_by = auth.uid() or (is_admin() and t.company_id = auth_company_id())))
  );
create policy "ticket_vehicles write" on ticket_vehicles
  for all using (
    exists (select 1 from tickets t where t.id = ticket_id
      and (
        (t.created_by = auth.uid() and t.status in ('draft','returned'))
        or (is_writable_admin() and t.company_id = auth_company_id())
      ))
  );

create policy "ticket_photos select" on ticket_photos
  for select using (
    exists (select 1 from tickets t where t.id = ticket_id
      and (t.created_by = auth.uid() or (is_admin() and t.company_id = auth_company_id())))
  );
create policy "ticket_photos write" on ticket_photos
  for all using (
    exists (select 1 from tickets t where t.id = ticket_id
      and (
        (t.created_by = auth.uid() and t.status in ('draft','returned'))
        or (is_writable_admin() and t.company_id = auth_company_id())
      ))
  );

create policy "ticket_signatures select" on ticket_signatures
  for select using (
    exists (select 1 from tickets t where t.id = ticket_id
      and (t.created_by = auth.uid() or (is_admin() and t.company_id = auth_company_id())))
  );
create policy "ticket_signatures write" on ticket_signatures
  for all using (
    exists (select 1 from tickets t where t.id = ticket_id
      and (
        (t.created_by = auth.uid() and t.status in ('draft','returned'))
        or (is_writable_admin() and t.company_id = auth_company_id())
      ))
  );

-- Audit log: read-only for anyone who can see the ticket
create policy "ticket_audit_log select" on ticket_audit_log
  for select using (
    exists (select 1 from tickets t where t.id = ticket_id
      and (t.created_by = auth.uid() or (is_admin() and t.company_id = auth_company_id())))
  );
create policy "ticket_audit_log insert" on ticket_audit_log
  for insert with check (
    exists (select 1 from tickets t where t.id = ticket_id
      and t.company_id = auth_company_id())
  );

-- Exports: all admins can read; writable admins can insert
create policy "ticket_exports select" on ticket_exports
  for select using (
    exists (select 1 from tickets t where t.id = ticket_id
      and (t.created_by = auth.uid() or (is_admin() and t.company_id = auth_company_id())))
  );
create policy "ticket_exports insert" on ticket_exports
  for insert with check (is_admin() and
    exists (select 1 from tickets t where t.id = ticket_id and t.company_id = auth_company_id())
  );

-- Notification prefs: own only
create policy "notification_prefs own" on notification_prefs
  for all using (user_id = auth.uid());

-- Writable admins manage sequences
create policy "ticket_number_sequences admin" on ticket_number_sequences
  for all using (is_writable_admin() and company_id = auth_company_id());

-- ============================================================
-- STORAGE BUCKETS (run via Supabase dashboard or CLI)
-- ============================================================
-- bucket: ticket-signatures  (private, max 2MB per file)
-- bucket: ticket-photos      (private, max 10MB per file)
-- bucket: ticket-exports     (private, max 20MB per file)
