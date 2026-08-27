-- Cander Phase 0: tenancy + profiles
-- Run via Supabase CLI: supabase db push

-- ── Organizations ────────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ── Profiles (1:1 with auth.users) ───────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  plan text not null default 'free' check (plan in ('free', 'pro', 'max', 'ultra')),
  role text not null default 'Owner' check (role in ('Owner', 'Admin', 'Member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Workspaces ───────────────────────────────────────────────────────────────
create table if not exists public.workspaces (
  id text primary key,
  org_id uuid references public.organizations (id) on delete set null,
  name text not null,
  kind text not null default 'business' check (kind in ('personal', 'business')),
  personal boolean not null default false,
  spaces text[] not null default array['work', 'build', 'research']::text[],
  budget text not null default '$0',
  spend text not null default '$0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Workspace membership ─────────────────────────────────────────────────────
create table if not exists public.workspace_members (
  workspace_id text not null references public.workspaces (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'Member' check (role in ('Owner', 'Admin', 'Member')),
  spaces text[] not null default array['work', 'build', 'research']::text[],
  created_at timestamptz not null default now(),
  primary key (workspace_id, profile_id)
);

create index if not exists workspace_members_profile_idx
  on public.workspace_members (profile_id);

-- ── updated_at trigger ───────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists workspaces_updated_at on public.workspaces;
create trigger workspaces_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

-- ── New user → profile + default workspace ───────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_id text;
  display_name text;
begin
  display_name := coalesce(
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1),
    'User'
  );

  insert into public.profiles (id, email, name)
  values (new.id, coalesce(new.email, ''), display_name)
  on conflict (id) do nothing;

  ws_id := 'ws-' || replace(new.id::text, '-', '');

  insert into public.workspaces (id, name, kind, personal, spaces)
  values (
    ws_id,
    display_name || '''s workspace',
    'personal',
    true,
    array['work', 'build', 'research']::text[]
  )
  on conflict (id) do nothing;

  insert into public.workspace_members (workspace_id, profile_id, role, spaces)
  values (
    ws_id,
    new.id,
    'Owner',
    array['work', 'build', 'research']::text[]
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- Profiles: own row
create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid());

-- Workspaces: members can read
create policy "workspaces_select_member"
  on public.workspaces for select
  using (
    id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

-- Workspace members: see co-members in shared workspaces
create policy "workspace_members_select"
  on public.workspace_members for select
  using (
    workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

-- Organizations: readable when user belongs to a workspace in the org (Phase 3 expands)
create policy "organizations_select_member"
  on public.organizations for select
  using (
    id in (
      select w.org_id
      from public.workspaces w
      join public.workspace_members wm on wm.workspace_id = w.id
      where wm.profile_id = auth.uid() and w.org_id is not null
    )
  );
