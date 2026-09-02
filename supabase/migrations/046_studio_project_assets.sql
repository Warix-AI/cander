-- Studio project images: durable per-workspace assets in private Storage.

create table if not exists public.studio_project_assets (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'image'
    check (kind in ('image')),
  storage_path text not null,
  mime_type text not null default 'image/png',
  byte_size bigint not null default 0 check (byte_size >= 0),
  aspect_ratio text,
  source text not null default 'upload'
    check (source in ('upload', 'generate', 'remove-bg', 'resize')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio_project_assets_project_idx
  on public.studio_project_assets (workspace_id, project_id, updated_at desc);

create index if not exists studio_project_assets_created_by_idx
  on public.studio_project_assets (created_by, created_at desc);

drop trigger if exists studio_project_assets_updated_at
  on public.studio_project_assets;
create trigger studio_project_assets_updated_at
  before update on public.studio_project_assets
  for each row execute function public.set_updated_at();

alter table public.studio_project_assets enable row level security;

drop policy if exists "studio_project_assets_member_select" on public.studio_project_assets;
create policy "studio_project_assets_member_select"
  on public.studio_project_assets for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "studio_project_assets_member_insert" on public.studio_project_assets;
create policy "studio_project_assets_member_insert"
  on public.studio_project_assets for insert
  with check (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "studio_project_assets_member_update" on public.studio_project_assets;
create policy "studio_project_assets_member_update"
  on public.studio_project_assets for update
  using (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  )
  with check (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "studio_project_assets_member_delete" on public.studio_project_assets;
create policy "studio_project_assets_member_delete"
  on public.studio_project_assets for delete
  using (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

grant select, insert, update, delete on public.studio_project_assets to authenticated;
grant all on public.studio_project_assets to service_role;

-- Private bucket for Studio canvas images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'studio-assets',
  'studio-assets',
  false,
  20971520,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path layout: {workspace_id}/{project_id}/{asset_id}.{ext}
drop policy if exists "studio_assets_member_select" on storage.objects;
create policy "studio_assets_member_select"
  on storage.objects for select
  using (
    bucket_id = 'studio-assets'
    and public.is_workspace_member((storage.foldername(name))[1])
  );

drop policy if exists "studio_assets_member_insert" on storage.objects;
create policy "studio_assets_member_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'studio-assets'
    and public.is_workspace_member((storage.foldername(name))[1])
  );

drop policy if exists "studio_assets_member_update" on storage.objects;
create policy "studio_assets_member_update"
  on storage.objects for update
  using (
    bucket_id = 'studio-assets'
    and public.is_workspace_member((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'studio-assets'
    and public.is_workspace_member((storage.foldername(name))[1])
  );

drop policy if exists "studio_assets_member_delete" on storage.objects;
create policy "studio_assets_member_delete"
  on storage.objects for delete
  using (
    bucket_id = 'studio-assets'
    and public.is_workspace_member((storage.foldername(name))[1])
  );
