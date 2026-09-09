-- Durable publish attempts + unique successful production publish per draft SHA.
-- Phase 0/1: one click → one Vercel deployment; idempotent on (project_id, draft_sha).

create table if not exists public.publish_attempts (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null,
  project_id text not null references public.projects (id) on delete cascade,
  publish_attempt_id text not null,
  idempotency_key text not null,
  draft_sha text not null,
  promoted_main_sha text,
  vercel_project_id text,
  vercel_deployment_id text,
  status text not null default 'pending'
    check (status in (
      'pending',
      'preflight',
      'deploying',
      'published',
      'failed',
      'git_sync_repair'
    )),
  error text,
  published_url text,
  git_sync_error text,
  meta jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists publish_attempts_attempt_id_uidx
  on public.publish_attempts (publish_attempt_id);

create unique index if not exists publish_attempts_idempotency_uidx
  on public.publish_attempts (idempotency_key);

-- At most one successful production publish per draft tip SHA.
create unique index if not exists publish_attempts_success_sha_uidx
  on public.publish_attempts (project_id, draft_sha)
  where status in ('published', 'git_sync_repair');

-- Only one in-flight attempt per project+sha (pending/preflight/deploying).
create unique index if not exists publish_attempts_inflight_sha_uidx
  on public.publish_attempts (project_id, draft_sha)
  where status in ('pending', 'preflight', 'deploying');

create index if not exists publish_attempts_project_idx
  on public.publish_attempts (project_id, started_at desc);

comment on table public.publish_attempts is
  'Durable Publish lock/idempotency: projectId+draftSha → at most one successful production deploy.';

-- Unique live production deployment row per project+sha when meta columns exist.
create unique index if not exists deployments_live_production_sha_uidx
  on public.deployments (project_id, git_sha)
  where kind = 'production' and status = 'live' and git_sha is not null;

-- Optional repair flag on projects (Git main out of sync after successful Vercel deploy).
alter table public.projects
  add column if not exists publish_git_sync_needed boolean not null default false;

alter table public.projects
  add column if not exists publish_git_sync_error text;

comment on column public.projects.publish_git_sync_needed is
  'True when Vercel production deploy succeeded but promoting main failed; production remains live.';

alter table public.publish_attempts enable row level security;

drop policy if exists "publish_attempts_owner_or_shared" on public.publish_attempts;
create policy "publish_attempts_owner_or_shared"
  on public.publish_attempts for all
  using (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.projects p
      where p.id = publish_attempts.project_id
        and public.can_access_workspace_project(p.workspace_id, p.created_by)
    )
  )
  with check (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.projects p
      where p.id = publish_attempts.project_id
        and public.can_access_workspace_project(p.workspace_id, p.created_by)
    )
  );
