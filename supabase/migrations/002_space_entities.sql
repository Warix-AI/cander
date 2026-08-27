-- Cander Phase 1: space entities
-- Run after 001_tenancy.sql

-- ── Projects ─────────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  space_id text not null,
  title text not null,
  summary text not null default '',
  cover text,
  kind text not null default 'general'
    check (kind in ('app', 'site', 'automation', 'research', 'general')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'published', 'archived')),
  instructions text,
  thread_id text,
  published_url text,
  domains text[] not null default array[]::text[],
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_workspace_space_idx
  on public.projects (workspace_id, space_id);

-- ── Sources ──────────────────────────────────────────────────────────────────
create table if not exists public.sources (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  space_id text not null,
  project_id text references public.projects (id) on delete set null,
  title text not null,
  kind text not null default 'web'
    check (kind in ('web', 'pdf', 'note', 'report', 'file')),
  url text,
  file_id text,
  folder_id text,
  citation_meta jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sources_workspace_idx
  on public.sources (workspace_id, space_id);

-- ── Briefing items ───────────────────────────────────────────────────────────
create table if not exists public.briefing_items (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  connector_id text,
  tone text not null default 'neutral'
    check (tone in ('urgent', 'waiting', 'ready', 'neutral')),
  title text not null,
  summary text not null default '',
  action_type text,
  external_id text,
  snoozed_until timestamptz,
  prompt text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists briefing_items_workspace_idx
  on public.briefing_items (workspace_id);

-- ── Deployments ──────────────────────────────────────────────────────────────
create table if not exists public.deployments (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  url text not null,
  status text not null default 'live'
    check (status in ('pending', 'live', 'failed')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deployments_project_idx
  on public.deployments (project_id);

-- ── Work attachments ─────────────────────────────────────────────────────────
create table if not exists public.work_attachments (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('connector', 'buildApp', 'automation')),
  target_id text not null,
  label text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, kind, target_id)
);

-- ── Entity links ───────────────────────────────────────────────────────────────
create table if not exists public.entity_links (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  from_type text not null,
  from_id text not null,
  to_type text not null,
  to_id text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, from_type, from_id, to_type, to_id)
);

-- ── updated_at triggers ──────────────────────────────────────────────────────
drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists sources_updated_at on public.sources;
create trigger sources_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

drop trigger if exists briefing_items_updated_at on public.briefing_items;
create trigger briefing_items_updated_at
  before update on public.briefing_items
  for each row execute function public.set_updated_at();

drop trigger if exists deployments_updated_at on public.deployments;
create trigger deployments_updated_at
  before update on public.deployments
  for each row execute function public.set_updated_at();

drop trigger if exists work_attachments_updated_at on public.work_attachments;
create trigger work_attachments_updated_at
  before update on public.work_attachments
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.projects enable row level security;
alter table public.sources enable row level security;
alter table public.briefing_items enable row level security;
alter table public.deployments enable row level security;
alter table public.work_attachments enable row level security;
alter table public.entity_links enable row level security;

create policy "projects_member"
  on public.projects for all
  using (
    workspace_id in (
      select wm.workspace_id from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select wm.workspace_id from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

create policy "sources_member"
  on public.sources for all
  using (
    workspace_id in (
      select wm.workspace_id from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select wm.workspace_id from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

create policy "briefing_items_member"
  on public.briefing_items for all
  using (
    workspace_id in (
      select wm.workspace_id from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select wm.workspace_id from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

create policy "deployments_member"
  on public.deployments for all
  using (
    workspace_id in (
      select wm.workspace_id from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select wm.workspace_id from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

create policy "work_attachments_member"
  on public.work_attachments for all
  using (
    workspace_id in (
      select wm.workspace_id from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select wm.workspace_id from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

create policy "entity_links_member"
  on public.entity_links for all
  using (
    workspace_id in (
      select wm.workspace_id from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select wm.workspace_id from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

-- Realtime
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.sources;
alter publication supabase_realtime add table public.briefing_items;
alter publication supabase_realtime add table public.deployments;
alter publication supabase_realtime add table public.work_attachments;
