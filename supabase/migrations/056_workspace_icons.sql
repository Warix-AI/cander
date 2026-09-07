-- Persist workspace logos in Supabase Storage and workspaces.icon_url.
alter table public.workspaces
  add column if not exists icon_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workspace-icons',
  'workspace-icons',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "workspace_icons_public_select" on storage.objects;
create policy "workspace_icons_public_select"
  on storage.objects for select
  using (bucket_id = 'workspace-icons');

drop policy if exists "workspace_icons_owner_insert" on storage.objects;
create policy "workspace_icons_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'workspace-icons'
    and exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = (storage.foldername(name))[1]
        and wm.profile_id = auth.uid()
        and wm.role = 'Owner'
    )
  );

drop policy if exists "workspace_icons_owner_update" on storage.objects;
create policy "workspace_icons_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'workspace-icons'
    and exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = (storage.foldername(name))[1]
        and wm.profile_id = auth.uid()
        and wm.role = 'Owner'
    )
  )
  with check (
    bucket_id = 'workspace-icons'
    and exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = (storage.foldername(name))[1]
        and wm.profile_id = auth.uid()
        and wm.role = 'Owner'
    )
  );

drop policy if exists "workspace_icons_owner_delete" on storage.objects;
create policy "workspace_icons_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'workspace-icons'
    and exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = (storage.foldername(name))[1]
        and wm.profile_id = auth.uid()
        and wm.role = 'Owner'
    )
  );
