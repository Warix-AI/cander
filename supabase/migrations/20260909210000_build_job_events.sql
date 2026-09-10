-- Website Builder V2: progress stream for long-running build jobs.
-- Jobs themselves are rows in public.ai_tasks (task_type = 'build_job').

create table if not exists public.build_job_events (
  id bigserial primary key,
  job_id uuid not null references public.ai_tasks (id) on delete cascade,
  seq integer not null,
  kind text not null,
  message text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (job_id, seq)
);

create index if not exists build_job_events_job_seq_idx
  on public.build_job_events (job_id, seq);

alter table public.build_job_events enable row level security;

-- Members of the job's workspace can read the stream. Writes are service-role only.
drop policy if exists build_job_events_select_member on public.build_job_events;
create policy build_job_events_select_member on public.build_job_events
  for select using (
    exists (
      select 1
      from public.ai_tasks t
      where t.id = build_job_events.job_id
        and (t.workspace_id is null or public.is_workspace_member(t.workspace_id))
    )
  );

grant select on public.build_job_events to authenticated;

-- Fast "active job for this project" lookup.
create index if not exists ai_tasks_project_build_job_idx
  on public.ai_tasks (project_id, status)
  where task_type = 'build_job';
