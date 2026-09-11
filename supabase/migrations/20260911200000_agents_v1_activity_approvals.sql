-- Agents V1: approvals, run events, identity metadata, idempotency.

alter table public.project_agents
  add column if not exists icon text;

alter table public.project_agents
  add column if not exists color text;

-- Denormalized hint only; sidebar pin source of truth remains user_pins.
alter table public.project_agents
  add column if not exists pinned boolean not null default false;

alter table public.agent_tool_permissions
  add column if not exists approval_mode text not null default 'require_approval';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_tool_permissions_approval_mode_check'
  ) then
    alter table public.agent_tool_permissions
      add constraint agent_tool_permissions_approval_mode_check
      check (approval_mode in ('auto', 'draft', 'require_approval'));
  end if;
end $$;

-- Expand agent_runs status for approval-needed drafts.
alter table public.agent_runs drop constraint if exists agent_runs_status_check;
alter table public.agent_runs
  add constraint agent_runs_status_check
  check (status in ('running', 'completed', 'failed', 'cancelled', 'approval_needed'));

alter table public.agent_runs
  add column if not exists idempotency_key text;

alter table public.agent_runs
  add column if not exists trigger_payload jsonb not null default '{}'::jsonb;

create unique index if not exists agent_runs_idempotency_uidx
  on public.agent_runs (agent_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.agent_run_events (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  agent_id text not null references public.project_agents (id) on delete cascade,
  run_id text not null references public.agent_runs (id) on delete cascade,
  seq integer not null default 0,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_run_events_run_idx
  on public.agent_run_events (run_id, seq, created_at);

create index if not exists agent_run_events_agent_idx
  on public.agent_run_events (agent_id, created_at desc);

alter table public.agent_run_events enable row level security;

drop policy if exists "agent_run_events_member_select" on public.agent_run_events;
create policy "agent_run_events_member_select"
  on public.agent_run_events for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "agent_run_events_member_insert" on public.agent_run_events;
create policy "agent_run_events_member_insert"
  on public.agent_run_events for insert
  with check (public.is_workspace_member(workspace_id));

grant select, insert on public.agent_run_events to authenticated;
grant all on public.agent_run_events to service_role;

comment on table public.agent_run_events is
  'Structured operational activity for agent runs (not ordinary chat).';

comment on column public.agent_tool_permissions.approval_mode is
  'auto = execute; draft = may draft without send; require_approval = high-impact needs user OK.';
