-- Flexible-scoped computer sessions (Vercel Sandbox + agent-browser)

create type public.computer_scope_type as enum ('chat', 'project', 'task', 'workspace');

create type public.computer_session_status as enum (
  'starting',
  'active',
  'idle',
  'stopped',
  'error'
);

create type public.computer_control_mode as enum ('agent', 'user', 'paused');

create table if not exists public.computer_sessions (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  scope_type public.computer_scope_type not null,
  scope_id text not null,
  chat_id text,
  project_id text,
  workspace_id text references public.workspaces (id) on delete set null,
  task_id text,
  provider text not null default 'vercel_sandbox',
  provider_session_id text,
  status public.computer_session_status not null default 'starting',
  control_mode public.computer_control_mode not null default 'agent',
  current_url text,
  stream_url text,
  browser_state jsonb,
  build_state jsonb,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists computer_sessions_user_scope_idx
  on public.computer_sessions (user_id, scope_type, scope_id, last_active_at desc);

create index if not exists computer_sessions_status_idx
  on public.computer_sessions (status, last_active_at desc);

-- Note: do not attach set_updated_at() — this table uses last_active_at instead of updated_at.

alter table public.computer_sessions enable row level security;

drop policy if exists "computer_sessions_own" on public.computer_sessions;
create policy "computer_sessions_own"
  on public.computer_sessions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.computer_sessions to authenticated;
