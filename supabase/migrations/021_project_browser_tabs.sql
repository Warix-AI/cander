-- Project browser tabs: one session per profile + workspace + space + project

create table if not exists public.project_browser_sessions (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  space_id text not null,
  project_id text not null,
  active_tab_id text not null,
  tabs jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (profile_id, workspace_id, space_id, project_id)
);

create index if not exists project_browser_sessions_workspace_idx
  on public.project_browser_sessions (workspace_id, updated_at desc);

drop trigger if exists project_browser_sessions_updated_at
  on public.project_browser_sessions;
create trigger project_browser_sessions_updated_at
  before update on public.project_browser_sessions
  for each row execute function public.set_updated_at();

alter table public.project_browser_sessions enable row level security;

drop policy if exists "project_browser_sessions_own" on public.project_browser_sessions;
create policy "project_browser_sessions_own"
  on public.project_browser_sessions for all
  using (
    profile_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  )
  with check (
    profile_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

alter publication supabase_realtime add table public.project_browser_sessions;
