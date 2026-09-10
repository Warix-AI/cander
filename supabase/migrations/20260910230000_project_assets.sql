-- Project brand assets (logo, favicon, OG image) for website projects.
-- Mirrors studio_project_assets; separate bucket so builder-facing signed URLs
-- never expose Studio canvas images.

create table if not exists public.project_assets (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'image'
    check (role in ('logo', 'favicon', 'og_image', 'image')),
  storage_path text not null,
  mime_type text not null default 'image/png',
  byte_size bigint not null default 0 check (byte_size >= 0),
  width integer,
  height integer,
  source text not null default 'upload'
    check (source in ('upload', 'generate')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_assets_project_idx
  on public.project_assets (workspace_id, project_id, role, updated_at desc);

drop trigger if exists project_assets_updated_at on public.project_assets;
create trigger project_assets_updated_at
  before update on public.project_assets
  for each row execute function public.set_updated_at();

alter table public.project_assets enable row level security;

drop policy if exists "project_assets_member_select" on public.project_assets;
create policy "project_assets_member_select"
  on public.project_assets for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "project_assets_member_insert" on public.project_assets;
create policy "project_assets_member_insert"
  on public.project_assets for insert
  with check (created_by = auth.uid() and public.is_workspace_member(workspace_id));

drop policy if exists "project_assets_member_delete" on public.project_assets;
create policy "project_assets_member_delete"
  on public.project_assets for delete
  using (created_by = auth.uid() and public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.project_assets to authenticated;
grant all on public.project_assets to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-assets',
  'project-assets',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path layout: {workspace_id}/{project_id}/{asset_id}.{ext}
drop policy if exists "project_assets_storage_member_select" on storage.objects;
create policy "project_assets_storage_member_select"
  on storage.objects for select
  using (
    bucket_id = 'project-assets'
    and public.is_workspace_member((storage.foldername(name))[1])
  );

drop policy if exists "project_assets_storage_member_insert" on storage.objects;
create policy "project_assets_storage_member_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'project-assets'
    and public.is_workspace_member((storage.foldername(name))[1])
  );

drop policy if exists "project_assets_storage_member_delete" on storage.objects;
create policy "project_assets_storage_member_delete"
  on storage.objects for delete
  using (
    bucket_id = 'project-assets'
    and public.is_workspace_member((storage.foldername(name))[1])
  );
