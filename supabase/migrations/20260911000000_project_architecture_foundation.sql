-- Architecture alignment, Phase 1: project record + infra state machines +
-- backend/secrets/env/agent-run/deployment/migration/publish-lock tables.
--
-- All new tables are server-owned (service role). RLS is enabled with
-- member SELECT only where the data is safe to show in the product UI;
-- secret values are never readable through PostgREST by end users.

-- ── projects: identity + per-provider state ──────────────────────────────────

alter table public.projects
  add column if not exists framework text not null default 'nextjs',
  add column if not exists template_version text,
  add column if not exists design_system jsonb,
  add column if not exists production_branch text,
  add column if not exists preview_url text,
  add column if not exists github_repo_url text,
  add column if not exists github_status text not null default 'not_created',
  add column if not exists vercel_status text not null default 'not_created',
  add column if not exists supabase_url text,
  add column if not exists archived_at timestamptz,
  add column if not exists teardown_status jsonb;

alter table public.projects drop constraint if exists projects_framework_check;
alter table public.projects
  add constraint projects_framework_check
  check (framework in ('nextjs', 'vite', 'astro', 'remix', 'sveltekit', 'nuxt', 'static'));

alter table public.projects drop constraint if exists projects_github_status_check;
alter table public.projects
  add constraint projects_github_status_check
  check (github_status in ('not_created', 'creating', 'ready', 'failed'));

alter table public.projects drop constraint if exists projects_vercel_status_check;
alter table public.projects
  add constraint projects_vercel_status_check
  check (vercel_status in ('not_created', 'creating', 'ready', 'failed'));

-- Backfill provider state from the ids that already exist.
update public.projects
  set github_status = 'ready'
  where github_repo_id is not null and github_status = 'not_created';
update public.projects
  set vercel_status = 'ready'
  where vercel_project_id is not null and vercel_status = 'not_created';
update public.projects
  set production_branch = coalesce(production_branch, github_default_branch, 'main')
  where github_repo_id is not null and production_branch is null;
update public.projects
  set github_repo_url = 'https://github.com/' || github_full_name
  where github_full_name is not null and github_repo_url is null;
update public.projects
  set supabase_url = 'https://' || supabase_project_ref || '.supabase.co'
  where supabase_project_ref is not null and supabase_url is null;

-- One provider resource per project, and one project per provider resource.
create unique index if not exists projects_vercel_project_id_unique
  on public.projects (vercel_project_id)
  where vercel_project_id is not null;

create unique index if not exists projects_supabase_project_ref_unique
  on public.projects (supabase_project_ref)
  where supabase_project_ref is not null;

comment on column public.projects.framework is 'Detected/selected app framework (nextjs default).';
comment on column public.projects.template_version is 'Template repo ref/tag the project was scaffolded from.';
comment on column public.projects.design_system is 'Persisted design tokens {colors, fonts, radius, spacing, ...} the agent references every turn.';
comment on column public.projects.production_branch is 'Git branch deployed to production (main).';
comment on column public.projects.github_status is 'not_created|creating|ready|failed';
comment on column public.projects.vercel_status is 'not_created|creating|ready|failed';
comment on column public.projects.archived_at is 'Soft-archive timestamp; hard delete + provider teardown happens later.';
comment on column public.projects.teardown_status is 'Per-provider teardown results {github, vercel, supabase, sandbox, domain}.';

-- computer_sessions may outlive the project row today; tie them together.
update public.computer_sessions cs
  set project_id = null
  where cs.project_id is not null
    and not exists (select 1 from public.projects p where p.id = cs.project_id);

alter table public.computer_sessions
  drop constraint if exists computer_sessions_project_id_fkey;
alter table public.computer_sessions
  add constraint computer_sessions_project_id_fkey
  foreign key (project_id) references public.projects (id) on delete set null;

-- ── project_backends: one Supabase project per Cander project ───────────────

create table if not exists public.project_backends (
  project_id text primary key references public.projects (id) on delete cascade,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  provider text not null default 'supabase' check (provider in ('supabase')),
  supabase_project_id text,
  supabase_project_ref text,
  supabase_url text,
  region text,
  organization_id text,
  status text not null default 'not_created'
    check (status in ('not_created', 'creating', 'ready', 'paused', 'failed')),
  failure_reason text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists project_backends_ref_unique
  on public.project_backends (supabase_project_ref)
  where supabase_project_ref is not null;

drop trigger if exists project_backends_updated_at on public.project_backends;
create trigger project_backends_updated_at
  before update on public.project_backends
  for each row execute function public.set_updated_at();

alter table public.project_backends enable row level security;
grant all on table public.project_backends to service_role;

drop policy if exists "project_backends_member_select" on public.project_backends;
create policy "project_backends_member_select"
  on public.project_backends for select
  using (public.is_workspace_member(workspace_id));

-- ── project_secrets: encrypted vault (values never leave the server) ────────

create table if not exists public.project_secrets (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  name text not null,
  -- AES-256-GCM, base64: iv || ciphertext || tag, key from CANDER_SECRETS_KEY.
  ciphertext text not null,
  key_version smallint not null default 1,
  -- Where the value came from: provisioning (supabase keys), user (typed in
  -- the secure input), integration (OAuth exchange), agent (generated).
  source text not null default 'user'
    check (source in ('provision', 'user', 'integration', 'agent')),
  -- Sensitivity controls where the value may be injected.
  sensitivity text not null default 'server'
    check (sensitivity in ('public', 'server')),
  description text,
  created_by uuid references public.profiles (id) on delete set null,
  last_rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create index if not exists project_secrets_project_idx
  on public.project_secrets (workspace_id, project_id);

drop trigger if exists project_secrets_updated_at on public.project_secrets;
create trigger project_secrets_updated_at
  before update on public.project_secrets
  for each row execute function public.set_updated_at();

-- RLS on, no member policies: only the service role reads/writes values.
alter table public.project_secrets enable row level security;
grant all on table public.project_secrets to service_role;

-- ── project_env_vars: scoped env → sandbox / Vercel with drift tracking ─────

create table if not exists public.project_env_vars (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  name text not null,
  scope text not null default 'all'
    check (scope in ('all', 'development', 'preview', 'production')),
  -- Either a plain (public) value or a reference to a vault secret.
  plain_value text,
  secret_id text references public.project_secrets (id) on delete cascade,
  -- Sync bookkeeping: hash of the value last pushed to each target.
  sandbox_synced_hash text,
  sandbox_synced_at timestamptz,
  vercel_synced_hash text,
  vercel_synced_at timestamptz,
  vercel_env_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name, scope),
  check ((plain_value is null) <> (secret_id is null))
);

create index if not exists project_env_vars_project_idx
  on public.project_env_vars (workspace_id, project_id);

drop trigger if exists project_env_vars_updated_at on public.project_env_vars;
create trigger project_env_vars_updated_at
  before update on public.project_env_vars
  for each row execute function public.set_updated_at();

alter table public.project_env_vars enable row level security;
grant all on table public.project_env_vars to service_role;

-- Members may see names/scopes/sync state (never secret values; plain values
-- are public by definition).
drop policy if exists "project_env_vars_member_select" on public.project_env_vars;
create policy "project_env_vars_member_select"
  on public.project_env_vars for select
  using (public.is_workspace_member(workspace_id));

-- ── build_runs + build_run_tool_calls: one record per user request ──────────────

create table if not exists public.build_runs (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  -- ai_tasks build_job row driving this run (null for non-build runs).
  build_job_id text,
  kind text not null default 'edit'
    check (kind in ('create', 'edit', 'repair', 'publish_fix', 'verify')),
  status text not null default 'queued'
    check (status in ('queued', 'planning', 'editing', 'testing', 'fixing', 'verifying', 'complete', 'failed', 'canceled')),
  instruction text,
  summary text,
  -- Commit produced by this run (undo target) and the tip it started from.
  base_sha text,
  result_sha text,
  failure_kind text check (failure_kind in ('infra', 'app', 'budget', 'agent', 'unknown')),
  failure_reason text,
  llm_calls integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  tool_calls integer not null default 0,
  files_touched integer not null default 0,
  estimated_cost_usd numeric(12, 6),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists build_runs_project_idx
  on public.build_runs (workspace_id, project_id, created_at desc);
create index if not exists build_runs_build_job_idx
  on public.build_runs (build_job_id)
  where build_job_id is not null;

drop trigger if exists build_runs_updated_at on public.build_runs;
create trigger build_runs_updated_at
  before update on public.build_runs
  for each row execute function public.set_updated_at();

alter table public.build_runs enable row level security;
grant all on table public.build_runs to service_role;

drop policy if exists "build_runs_member_select" on public.build_runs;
create policy "build_runs_member_select"
  on public.build_runs for select
  using (public.is_workspace_member(workspace_id));

create table if not exists public.build_run_tool_calls (
  id bigint generated always as identity primary key,
  run_id text not null references public.build_runs (id) on delete cascade,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  seq integer not null,
  tool text not null,
  -- Redacted: file paths, route names, short summaries. Never secrets, never
  -- full file bodies or raw shell output.
  summary text,
  paths text[] not null default array[]::text[],
  ok boolean,
  duration_ms integer,
  created_at timestamptz not null default now(),
  unique (run_id, seq)
);

create index if not exists build_run_tool_calls_run_idx
  on public.build_run_tool_calls (run_id, seq);

alter table public.build_run_tool_calls enable row level security;
grant all on table public.build_run_tool_calls to service_role;

drop policy if exists "build_run_tool_calls_member_select" on public.build_run_tool_calls;
create policy "build_run_tool_calls_member_select"
  on public.build_run_tool_calls for select
  using (public.is_workspace_member(workspace_id));

-- ── deployment_events: Vercel lifecycle per publish attempt ─────────────────

create table if not exists public.deployment_events (
  id bigint generated always as identity primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  publish_attempt_id text,
  vercel_deployment_id text,
  commit_sha text,
  state text not null
    check (state in ('queued', 'building', 'ready', 'failed', 'canceled', 'promoted', 'rolled_back')),
  url text,
  failure_reason text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists deployment_events_project_idx
  on public.deployment_events (project_id, created_at desc);
create index if not exists deployment_events_attempt_idx
  on public.deployment_events (publish_attempt_id)
  where publish_attempt_id is not null;

alter table public.deployment_events enable row level security;
grant all on table public.deployment_events to service_role;

drop policy if exists "deployment_events_member_select" on public.deployment_events;
create policy "deployment_events_member_select"
  on public.deployment_events for select
  using (public.is_workspace_member(workspace_id));

-- Previous healthy deployment for rollback.
alter table public.projects
  add column if not exists vercel_previous_deployment_id text,
  add column if not exists vercel_previous_sha text;

-- ── project_migrations: ledger of generated-app schema migrations ───────────

create table if not exists public.project_migrations (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  -- supabase/migrations/<version>_<name>.sql in the project repo.
  version text not null,
  name text not null,
  file_path text not null,
  checksum text not null,
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'failed', 'rolled_back')),
  applied_to text check (applied_to in ('development', 'production')),
  applied_at timestamptz,
  applied_sha text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists project_migrations_version_target_uidx
  on public.project_migrations (project_id, version, coalesce(applied_to, 'development'));

create index if not exists project_migrations_project_idx
  on public.project_migrations (project_id, version);

drop trigger if exists project_migrations_updated_at on public.project_migrations;
create trigger project_migrations_updated_at
  before update on public.project_migrations
  for each row execute function public.set_updated_at();

alter table public.project_migrations enable row level security;
grant all on table public.project_migrations to service_role;

drop policy if exists "project_migrations_member_select" on public.project_migrations;
create policy "project_migrations_member_select"
  on public.project_migrations for select
  using (public.is_workspace_member(workspace_id));

-- ── project_publish_locks: exclusive per-project publish ────────────────────

create table if not exists public.project_publish_locks (
  project_id text primary key references public.projects (id) on delete cascade,
  holder text not null,
  publish_attempt_id text,
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.project_publish_locks enable row level security;
grant all on table public.project_publish_locks to service_role;

-- Returns true when the caller now holds the lock (fresh, re-entrant, or a
-- stale lock was reclaimed).
create or replace function public.acquire_publish_lock(
  p_project_id text,
  p_holder text,
  p_attempt_id text,
  p_ttl_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_rows integer;
begin
  insert into public.project_publish_locks (project_id, holder, publish_attempt_id, acquired_at, heartbeat_at, expires_at)
  values (p_project_id, p_holder, p_attempt_id, v_now, v_now, v_now + make_interval(secs => p_ttl_seconds))
  on conflict (project_id) do update
    set holder = excluded.holder,
        publish_attempt_id = excluded.publish_attempt_id,
        acquired_at = v_now,
        heartbeat_at = v_now,
        expires_at = excluded.expires_at
    where public.project_publish_locks.holder = excluded.holder
       or public.project_publish_locks.expires_at < v_now;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.release_publish_lock(
  p_project_id text,
  p_holder text
) returns void
language sql
security definer
set search_path = public
as $$
  delete from public.project_publish_locks
  where project_id = p_project_id and holder = p_holder;
$$;

revoke all on function public.acquire_publish_lock(text, text, text, integer) from public;
revoke all on function public.release_publish_lock(text, text) from public;
grant execute on function public.acquire_publish_lock(text, text, text, integer) to service_role;
grant execute on function public.release_publish_lock(text, text) to service_role;
