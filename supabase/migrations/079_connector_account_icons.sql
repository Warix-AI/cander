-- Per-account icon for connector connections (Candor display only).
-- Path layout: {owner_id}/{connection_id}/icon.{ext}

alter table public.connector_connections
  add column if not exists icon_url text;

-- Migration 050 uses explicit column SELECT grants; re-grant for clients.
grant select (icon_url) on table public.connector_connections to authenticated;
grant update (icon_url) on table public.connector_connections to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'connector-account-icons',
  'connector-account-icons',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "connector_account_icons_public_select" on storage.objects;
create policy "connector_account_icons_public_select"
  on storage.objects for select
  using (bucket_id = 'connector-account-icons');

drop policy if exists "connector_account_icons_owner_insert" on storage.objects;
create policy "connector_account_icons_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'connector-account-icons'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "connector_account_icons_owner_update" on storage.objects;
create policy "connector_account_icons_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'connector-account-icons'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'connector-account-icons'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "connector_account_icons_owner_delete" on storage.objects;
create policy "connector_account_icons_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'connector-account-icons'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
