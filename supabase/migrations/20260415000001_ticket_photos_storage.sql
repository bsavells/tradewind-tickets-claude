-- Create ticket-photos storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-photos',
  'ticket-photos',
  false,
  10485760,
  array['image/jpeg','image/png','image/heic','image/heif','image/webp']
)
on conflict (id) do nothing;

-- Storage RLS policies (company-scoped)
-- Table-level RLS on ticket_photos is the true authz gatekeeper.
-- Storage policies enforce company isolation only.

create policy "ticket-photos select" on storage.objects
  for select using (
    bucket_id = 'ticket-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (auth_company_id())::text
  );

create policy "ticket-photos insert" on storage.objects
  for insert with check (
    bucket_id = 'ticket-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (auth_company_id())::text
  );

create policy "ticket-photos delete" on storage.objects
  for delete using (
    bucket_id = 'ticket-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (auth_company_id())::text
  );
