-- Agents simplify: persistent Agent ↔ Cander conversation transcript.

create table if not exists public.agent_messages (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  agent_id text not null references public.project_agents (id) on delete cascade,
  run_id text references public.agent_runs (id) on delete set null,
  role text not null check (role in ('agent', 'cander', 'system')),
  content text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists agent_messages_agent_idx
  on public.agent_messages (agent_id, created_at asc);

create index if not exists agent_messages_run_idx
  on public.agent_messages (run_id, created_at asc)
  where run_id is not null;

alter table public.agent_messages enable row level security;

drop policy if exists "agent_messages_member_select" on public.agent_messages;
create policy "agent_messages_member_select"
  on public.agent_messages for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "agent_messages_member_insert" on public.agent_messages;
create policy "agent_messages_member_insert"
  on public.agent_messages for insert
  with check (public.is_workspace_member(workspace_id));

grant select, insert on public.agent_messages to authenticated;
grant all on public.agent_messages to service_role;

comment on table public.agent_messages is
  'Runtime conversation between an Agent (user-like) and Cander AI. Builder chat is separate.';

-- Legacy gmail triggers become manual; schedules keep working via cron.
update public.project_agents
set trigger = jsonb_build_object('type', 'manual')
where coalesce(trigger->>'type', '') = 'gmail_new_message';
