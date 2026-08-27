-- Cander Phase 3: org, policy, user preferences
-- Run after 003_chat.sql

-- ── Org members (demo roster + invited users) ────────────────────────────────
create table if not exists public.org_members (
  id text primary key,
  org_id uuid references public.organizations (id) on delete set null,
  profile_id uuid references public.profiles (id) on delete set null,
  email text not null default '',
  name text not null default '',
  short_name text not null default '',
  initials text not null default '',
  role text not null default 'Member'
    check (role in ('Owner', 'Admin', 'Member')),
  plan text not null default 'free'
    check (plan in ('free', 'pro', 'max', 'ultra')),
  seat_status text not null default 'active'
    check (seat_status in ('active', 'pending')),
  kind text not null default 'org'
    check (kind in ('org', 'personal')),
  workspace_ids text[] not null default array[]::text[],
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_members_profile_idx
  on public.org_members (profile_id);

-- ── Workspace policy header ──────────────────────────────────────────────────
create table if not exists public.workspace_policies (
  workspace_id text primary key references public.workspaces (id) on delete cascade,
  disabled_connectors text[] not null default array[]::text[],
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Per-member space ACL ───────────────────────────────────────────────────────
create table if not exists public.workspace_member_spaces (
  workspace_id text not null references public.workspaces (id) on delete cascade,
  member_id text not null references public.org_members (id) on delete cascade,
  spaces text[] not null default array[]::text[],
  primary key (workspace_id, member_id)
);

-- ── Knowledge bases + files ────────────────────────────────────────────────────
create table if not exists public.knowledge_bases (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  name text not null,
  summary text not null default '',
  sources_count integer not null default 0,
  updated_label text not null default 'Just now',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_files (
  id text primary key,
  knowledge_base_id text not null references public.knowledge_bases (id) on delete cascade,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  name text not null,
  size_label text not null default '—',
  uploaded_label text not null default 'Just now',
  created_at timestamptz not null default now()
);

create index if not exists knowledge_bases_workspace_idx
  on public.knowledge_bases (workspace_id);

-- ── User pins (per profile) ────────────────────────────────────────────────────
create table if not exists public.user_pins (
  id text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('thread', 'project', 'connector')),
  target_id text not null,
  tier text not null default 'primary'
    check (tier in ('primary', 'secondary')),
  sort_order integer not null default 0,
  unique (profile_id, kind, target_id)
);

create index if not exists user_pins_profile_idx
  on public.user_pins (profile_id, sort_order);

-- ── Sidebar layout (per profile) ─────────────────────────────────────────────
create table if not exists public.sidebar_layouts (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  main_nav jsonb not null default '[]'::jsonb,
  more_nav jsonb not null default '[]'::jsonb,
  layout_version integer not null default 12,
  updated_at timestamptz not null default now()
);

-- ── updated_at triggers ────────────────────────────────────────────────────────
drop trigger if exists org_members_updated_at on public.org_members;
create trigger org_members_updated_at
  before update on public.org_members
  for each row execute function public.set_updated_at();

drop trigger if exists workspace_policies_updated_at on public.workspace_policies;
create trigger workspace_policies_updated_at
  before update on public.workspace_policies
  for each row execute function public.set_updated_at();

drop trigger if exists knowledge_bases_updated_at on public.knowledge_bases;
create trigger knowledge_bases_updated_at
  before update on public.knowledge_bases
  for each row execute function public.set_updated_at();

-- ── RLS helpers ──────────────────────────────────────────────────────────────
-- Member can access workspace if listed in workspace_members OR workspace_ids on org_members

create or replace function public.is_workspace_member(ws_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = ws_id and wm.profile_id = auth.uid()
  );
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.org_members enable row level security;
alter table public.workspace_policies enable row level security;
alter table public.workspace_member_spaces enable row level security;
alter table public.knowledge_bases enable row level security;
alter table public.knowledge_files enable row level security;
alter table public.user_pins enable row level security;
alter table public.sidebar_layouts enable row level security;

create policy "org_members_select"
  on public.org_members for select
  using (
    profile_id = auth.uid()
    or exists (
      select 1
      from public.workspace_members wm
      where wm.profile_id = auth.uid()
        and wm.workspace_id = any (org_members.workspace_ids)
    )
  );

create policy "org_members_write"
  on public.org_members for all
  using (
    profile_id = auth.uid()
    or exists (
      select 1
      from public.workspace_members wm
      where wm.profile_id = auth.uid()
        and wm.role in ('Owner', 'Admin')
        and wm.workspace_id = any (org_members.workspace_ids)
    )
  )
  with check (
    profile_id = auth.uid()
    or profile_id is null
    or exists (
      select 1
      from public.workspace_members wm
      where wm.profile_id = auth.uid()
        and wm.role in ('Owner', 'Admin')
        and wm.workspace_id = any (org_members.workspace_ids)
    )
  );

create policy "workspace_policies_member"
  on public.workspace_policies for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "workspace_member_spaces_member"
  on public.workspace_member_spaces for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "knowledge_bases_member"
  on public.knowledge_bases for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "knowledge_files_member"
  on public.knowledge_files for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "user_pins_own"
  on public.user_pins for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "sidebar_layouts_own"
  on public.sidebar_layouts for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Workspace catalog writes (custom workspaces + first-login import)
create policy "workspaces_insert_authenticated"
  on public.workspaces for insert
  to authenticated
  with check (true);

create policy "workspaces_update_admin"
  on public.workspaces for update
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.profile_id = auth.uid()
        and wm.role in ('Owner', 'Admin')
    )
  );

create policy "workspace_members_insert"
  on public.workspace_members for insert
  with check (
    profile_id = auth.uid()
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.profile_id = auth.uid()
        and wm.role in ('Owner', 'Admin')
    )
  );

-- Realtime
alter publication supabase_realtime add table public.workspace_policies;
alter publication supabase_realtime add table public.org_members;
alter publication supabase_realtime add table public.user_pins;
