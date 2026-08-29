-- Cander Intelligence: durable tasks + draft/published revisions

create table if not exists public.ai_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  thread_id text not null,
  project_id uuid references public.projects (id) on delete set null,
  draft_revision_id uuid,
  title text not null default 'Work task',
  goal text not null default '',
  kind text not null default 'coding'
    check (kind in ('coding', 'research', 'multi_step')),
  task_type text not null default 'execution',
  status text not null default 'queued'
    check (status in (
      'drafting',
      'awaiting_user',
      'queued',
      'running',
      'verifying',
      'ready_for_review',
      'ready_to_publish',
      'published',
      'failed',
      'cancelled'
    )),
  progress_note text not null default '',
  acceptance_criteria text,
  facts jsonb not null default '{}'::jsonb,
  routing_decision jsonb,
  result_summary text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_tasks_idempotency_uidx
  on public.ai_tasks (workspace_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists ai_tasks_thread_idx on public.ai_tasks (thread_id);
create index if not exists ai_tasks_project_idx on public.ai_tasks (project_id);
create index if not exists ai_tasks_status_idx on public.ai_tasks (status);

alter table public.ai_tasks enable row level security;

create policy ai_tasks_select_member on public.ai_tasks
  for select using (
    workspace_id is null
    or public.is_workspace_member(workspace_id::text)
  );

create policy ai_tasks_insert_member on public.ai_tasks
  for insert with check (
    workspace_id is null
    or public.is_workspace_member(workspace_id::text)
  );

create policy ai_tasks_update_member on public.ai_tasks
  for update using (
    workspace_id is null
    or public.is_workspace_member(workspace_id::text)
  );

create table if not exists public.project_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  kind text not null
    check (kind in ('draft_tip', 'candidate', 'published')),
  parent_revision_id uuid references public.project_revisions (id) on delete set null,
  storage_pointer text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists project_revisions_project_idx
  on public.project_revisions (project_id, kind);

alter table public.project_revisions enable row level security;

create policy project_revisions_select on public.project_revisions
  for select using (
    workspace_id is null
    or public.is_workspace_member(workspace_id::text)
  );

create policy project_revisions_insert on public.project_revisions
  for insert with check (
    workspace_id is null
    or public.is_workspace_member(workspace_id::text)
  );

create table if not exists public.project_change_sets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  base_revision_id uuid references public.project_revisions (id) on delete set null,
  candidate_revision_id uuid references public.project_revisions (id) on delete set null,
  status text not null default 'pending_review'
    check (status in (
      'pending_review',
      'accepted',
      'rejected',
      'merged',
      'failed'
    )),
  summary text not null default '',
  worker_run_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_change_sets_project_idx
  on public.project_change_sets (project_id);

alter table public.project_change_sets enable row level security;

create policy project_change_sets_select on public.project_change_sets
  for select using (
    workspace_id is null
    or public.is_workspace_member(workspace_id::text)
  );

create policy project_change_sets_insert on public.project_change_sets
  for insert with check (
    workspace_id is null
    or public.is_workspace_member(workspace_id::text)
  );

create policy project_change_sets_update on public.project_change_sets
  for update using (
    workspace_id is null
    or public.is_workspace_member(workspace_id::text)
  );

alter table public.projects
  add column if not exists draft_revision_id uuid references public.project_revisions (id) on delete set null;

alter table public.projects
  add column if not exists published_revision_id uuid references public.project_revisions (id) on delete set null;

-- Link durable tasks to draft revisions once both tables exist
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_tasks_draft_revision_id_fkey'
  ) then
    alter table public.ai_tasks
      add constraint ai_tasks_draft_revision_id_fkey
      foreign key (draft_revision_id)
      references public.project_revisions (id)
      on delete set null;
  end if;
end $$;

-- Routing / outcome telemetry (Phase 6)
create table if not exists public.ai_routing_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  thread_id text,
  project_id uuid references public.projects (id) on delete set null,
  task_type text not null,
  target text not null,
  reason text not null default '',
  latency_ms integer,
  outcome text,
  created_at timestamptz not null default now()
);

create index if not exists ai_routing_events_ws_idx
  on public.ai_routing_events (workspace_id, created_at desc);

alter table public.ai_routing_events enable row level security;

create policy ai_routing_events_insert on public.ai_routing_events
  for insert with check (
    workspace_id is null
    or public.is_workspace_member(workspace_id::text)
  );

create policy ai_routing_events_select on public.ai_routing_events
  for select using (
    workspace_id is null
    or public.is_workspace_member(workspace_id::text)
  );
