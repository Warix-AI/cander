-- Cander Phase 5: build runtime + browser sessions
-- Run after 005_connectors.sql

-- ── Project file tree (Build panel) ──────────────────────────────────────────
create table if not exists public.project_files (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  path text not null,
  label text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, path)
);

create index if not exists project_files_project_idx
  on public.project_files (project_id, sort_order);

-- ── Browser session (per profile + workspace) ────────────────────────────────
create table if not exists public.browser_sessions (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  url text not null default 'https://openai.com/api/pricing',
  title text not null default '',
  updated_at timestamptz not null default now(),
  primary key (profile_id, workspace_id)
);

drop trigger if exists browser_sessions_updated_at on public.browser_sessions;
create trigger browser_sessions_updated_at
  before update on public.browser_sessions
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.project_files enable row level security;
alter table public.browser_sessions enable row level security;

create policy "project_files_member"
  on public.project_files for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "browser_sessions_own"
  on public.browser_sessions for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

alter publication supabase_realtime add table public.browser_sessions;
