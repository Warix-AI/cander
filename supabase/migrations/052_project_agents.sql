-- Project Agent Builder: multi-agent config per automation project.

create table if not exists public.project_agents (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  name text not null,
  description text not null default '',
  instructions text not null default '',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_agents_project_idx
  on public.project_agents (workspace_id, project_id, sort_order, created_at);

create index if not exists project_agents_created_by_idx
  on public.project_agents (created_by, created_at desc);

drop trigger if exists project_agents_updated_at on public.project_agents;
create trigger project_agents_updated_at
  before update on public.project_agents
  for each row execute function public.set_updated_at();

alter table public.project_agents enable row level security;

drop policy if exists "project_agents_member_select" on public.project_agents;
create policy "project_agents_member_select"
  on public.project_agents for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "project_agents_member_insert" on public.project_agents;
create policy "project_agents_member_insert"
  on public.project_agents for insert
  with check (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "project_agents_member_update" on public.project_agents;
create policy "project_agents_member_update"
  on public.project_agents for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "project_agents_member_delete" on public.project_agents;
create policy "project_agents_member_delete"
  on public.project_agents for delete
  using (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.project_agents to authenticated;
grant all on public.project_agents to service_role;

-- Skill package assignments (skill ids from product skill packages / drafts).
create table if not exists public.agent_skill_assignments (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  agent_id text not null references public.project_agents (id) on delete cascade,
  skill_id text not null,
  skill_label text not null default '',
  created_at timestamptz not null default now(),
  unique (agent_id, skill_id)
);

create index if not exists agent_skill_assignments_agent_idx
  on public.agent_skill_assignments (agent_id);

alter table public.agent_skill_assignments enable row level security;

drop policy if exists "agent_skill_assignments_member_all" on public.agent_skill_assignments;
create policy "agent_skill_assignments_member_all"
  on public.agent_skill_assignments for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.agent_skill_assignments to authenticated;
grant all on public.agent_skill_assignments to service_role;

-- Knowledge / file / project resource refs (explicit attach only).
create table if not exists public.agent_knowledge_assignments (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  agent_id text not null references public.project_agents (id) on delete cascade,
  source_kind text not null check (source_kind in ('knowledge_base', 'file', 'project_resource')),
  source_id text not null,
  source_label text not null default '',
  created_at timestamptz not null default now(),
  unique (agent_id, source_kind, source_id)
);

create index if not exists agent_knowledge_assignments_agent_idx
  on public.agent_knowledge_assignments (agent_id);

alter table public.agent_knowledge_assignments enable row level security;

drop policy if exists "agent_knowledge_assignments_member_all" on public.agent_knowledge_assignments;
create policy "agent_knowledge_assignments_member_all"
  on public.agent_knowledge_assignments for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.agent_knowledge_assignments to authenticated;
grant all on public.agent_knowledge_assignments to service_role;

-- Connector scopes (connection ids; never cross-user).
create table if not exists public.agent_connector_scopes (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  agent_id text not null references public.project_agents (id) on delete cascade,
  connection_id text not null,
  connector_id text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (agent_id, connection_id)
);

create index if not exists agent_connector_scopes_agent_idx
  on public.agent_connector_scopes (agent_id);

alter table public.agent_connector_scopes enable row level security;

drop policy if exists "agent_connector_scopes_member_all" on public.agent_connector_scopes;
create policy "agent_connector_scopes_member_all"
  on public.agent_connector_scopes for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.agent_connector_scopes to authenticated;
grant all on public.agent_connector_scopes to service_role;

-- Per-agent tool permissions (tool IDs, least privilege).
create table if not exists public.agent_tool_permissions (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  agent_id text not null references public.project_agents (id) on delete cascade,
  connection_id text not null,
  tool_id text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (agent_id, connection_id, tool_id)
);

create index if not exists agent_tool_permissions_agent_idx
  on public.agent_tool_permissions (agent_id, connection_id);

alter table public.agent_tool_permissions enable row level security;

drop policy if exists "agent_tool_permissions_member_all" on public.agent_tool_permissions;
create policy "agent_tool_permissions_member_all"
  on public.agent_tool_permissions for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.agent_tool_permissions to authenticated;
grant all on public.agent_tool_permissions to service_role;

-- Routes (WHEN / IF / DO). Actions stored as jsonb for v1 (no live runtime yet).
create table if not exists public.agent_routes (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  agent_id text not null references public.project_agents (id) on delete cascade,
  name text not null default 'Route',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  trigger jsonb not null default '{}'::jsonb,
  condition jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_routes_agent_idx
  on public.agent_routes (agent_id, sort_order, created_at);

drop trigger if exists agent_routes_updated_at on public.agent_routes;
create trigger agent_routes_updated_at
  before update on public.agent_routes
  for each row execute function public.set_updated_at();

alter table public.agent_routes enable row level security;

drop policy if exists "agent_routes_member_all" on public.agent_routes;
create policy "agent_routes_member_all"
  on public.agent_routes for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.agent_routes to authenticated;
grant all on public.agent_routes to service_role;
