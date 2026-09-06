-- Agent V1: workspace skills, agent trigger/scheduler state, agent_runs.
-- agent_routes kept dormant (deterministic workflows later).

-- Workspace-scoped reusable skills
create table if not exists public.agent_skills (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  name text not null,
  description text not null default '',
  markdown text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_skills_workspace_idx
  on public.agent_skills (workspace_id, updated_at desc);

drop trigger if exists agent_skills_updated_at on public.agent_skills;
create trigger agent_skills_updated_at
  before update on public.agent_skills
  for each row execute function public.set_updated_at();

alter table public.agent_skills enable row level security;

drop policy if exists "agent_skills_member_all" on public.agent_skills;
create policy "agent_skills_member_all"
  on public.agent_skills for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.agent_skills to authenticated;
grant all on public.agent_skills to service_role;

-- Point assignments at workspace skills (skill_id becomes FK to agent_skills.id)
-- Keep skill_label as denormalized display cache.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'agent_skill_assignments'
      and column_name = 'skill_ref_id'
  ) then
    alter table public.agent_skill_assignments
      add column skill_ref_id text references public.agent_skills (id) on delete cascade;
  end if;
end $$;

create index if not exists agent_skill_assignments_skill_ref_idx
  on public.agent_skill_assignments (skill_ref_id);

-- Agent status (executable) — separate from scheduling
alter table public.project_agents
  add column if not exists status text not null default 'active'
    check (status in ('draft', 'active', 'paused'));

-- Trigger config (manual | schedule) — not agent_routes
alter table public.project_agents
  add column if not exists trigger jsonb not null default '{"type":"manual"}'::jsonb;

-- Scheduler state + claim lock
alter table public.project_agents
  add column if not exists next_run_at timestamptz;

alter table public.project_agents
  add column if not exists last_triggered_at timestamptz;

alter table public.project_agents
  add column if not exists schedule_claim_token text;

alter table public.project_agents
  add column if not exists schedule_claimed_at timestamptz;

create index if not exists project_agents_schedule_due_idx
  on public.project_agents (next_run_at)
  where next_run_at is not null and status = 'active';

-- Map legacy enabled → status (one-time backfill for rows still defaulted)
update public.project_agents
set status = case when enabled then 'active' else 'paused' end
where status = 'active' and enabled = false;

-- Agent runs (create before model loop; no derived previous_successful_run_at)
create table if not exists public.agent_runs (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  agent_id text not null references public.project_agents (id) on delete cascade,
  trigger_type text not null default 'manual',
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary text,
  error text,
  created_by uuid references public.profiles (id) on delete set null
);

create index if not exists agent_runs_agent_idx
  on public.agent_runs (agent_id, started_at desc);

create index if not exists agent_runs_workspace_idx
  on public.agent_runs (workspace_id, started_at desc);

alter table public.agent_runs enable row level security;

drop policy if exists "agent_runs_member_select" on public.agent_runs;
create policy "agent_runs_member_select"
  on public.agent_runs for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "agent_runs_member_insert" on public.agent_runs;
create policy "agent_runs_member_insert"
  on public.agent_runs for insert
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "agent_runs_member_update" on public.agent_runs;
create policy "agent_runs_member_update"
  on public.agent_runs for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

grant select, insert, update on public.agent_runs to authenticated;
grant all on public.agent_runs to service_role;

-- Tag tool executions with agent_run_id when present
alter table public.tool_executions
  add column if not exists agent_run_id text references public.agent_runs (id) on delete set null;

create index if not exists tool_executions_agent_run_idx
  on public.tool_executions (agent_run_id)
  where agent_run_id is not null;

-- Backfill: create a workspace skill from each agent's instructions and assign it
do $$
declare
  r record;
  skill_id text;
  assign_id text;
begin
  for r in
    select id, workspace_id, project_id, name, instructions, created_by
    from public.project_agents
  loop
    if exists (
      select 1 from public.agent_skill_assignments a
      where a.agent_id = r.id and a.skill_ref_id is not null
    ) then
      continue;
    end if;

    skill_id := 'askill_' || substr(replace(r.id, 'pag_', ''), 1, 28);
    insert into public.agent_skills (id, workspace_id, name, description, markdown, created_by)
    values (
      skill_id,
      r.workspace_id,
      coalesce(nullif(trim(r.name), ''), 'Agent') || ' skill',
      '',
      coalesce(nullif(trim(r.instructions), ''), '# Skill' || E'\n\n' || 'Describe what this agent should do.'),
      r.created_by
    )
    on conflict (id) do nothing;

    assign_id := 'ask_' || substr(replace(r.id, 'pag_', ''), 1, 16);
    insert into public.agent_skill_assignments (
      id, workspace_id, project_id, agent_id, skill_id, skill_label, skill_ref_id
    )
    values (
      assign_id,
      r.workspace_id,
      r.project_id,
      r.id,
      skill_id,
      coalesce(nullif(trim(r.name), ''), 'Agent') || ' skill',
      skill_id
    )
    on conflict (agent_id, skill_id) do update
      set skill_ref_id = excluded.skill_ref_id,
          skill_label = excluded.skill_label;
  end loop;
end $$;
