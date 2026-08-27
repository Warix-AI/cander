-- Cander Phase 4: connectors
-- Run after 004_org_policy.sql

-- ── Marketplace catalog (static seed) ────────────────────────────────────────
create table if not exists public.connector_catalog (
  id text primary key,
  name text not null,
  category text not null default 'Productivity',
  description text not null default '',
  icon text not null default 'generic',
  scope text not null default 'public'
    check (scope in ('public', 'personal')),
  featured boolean not null default false,
  actions jsonb not null default '[]'::jsonb,
  panel_type text not null default 'generic'
    check (panel_type in ('gmail', 'handshake', 'generic')),
  created_at timestamptz not null default now()
);

-- ── Installs: profile catalog + workspace work stack ─────────────────────────
create table if not exists public.connector_installations (
  id text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id text references public.workspaces (id) on delete cascade,
  connector_id text not null references public.connector_catalog (id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists connector_installations_profile_catalog_idx
  on public.connector_installations (profile_id, connector_id)
  where workspace_id is null;

create unique index if not exists connector_installations_workspace_idx
  on public.connector_installations (workspace_id, connector_id)
  where workspace_id is not null;

create index if not exists connector_installations_workspace_order_idx
  on public.connector_installations (workspace_id, sort_order)
  where workspace_id is not null;

-- ── Connected accounts (OAuth-ready; token_ref for Vault later) ───────────────
create table if not exists public.connector_accounts (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  connector_id text not null references public.connector_catalog (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  label text not null,
  status text not null default 'connected'
    check (status in ('connected', 'needs-reauth', 'error')),
  token_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists connector_accounts_workspace_idx
  on public.connector_accounts (workspace_id, connector_id);

drop trigger if exists connector_accounts_updated_at on public.connector_accounts;
create trigger connector_accounts_updated_at
  before update on public.connector_accounts
  for each row execute function public.set_updated_at();

-- ── Seed catalog ─────────────────────────────────────────────────────────────
insert into public.connector_catalog
  (id, name, category, description, icon, scope, featured, actions, panel_type)
values
  (
    'handshake',
    'Handshake',
    'Featured',
    'Trust layer between AI agents and your business',
    'handshake',
    'public',
    true,
    '["Connect systems","Manage capabilities","Review conversations"]'::jsonb,
    'handshake'
  ),
  (
    'gmail',
    'Gmail',
    'Productivity',
    'Search, read, draft, and send mail via MCP',
    'gmail',
    'public',
    true,
    '["Search","Read","Draft","Send","Labels","Filters"]'::jsonb,
    'gmail'
  ),
  (
    'slack',
    'Slack',
    'Productivity',
    'Search and post in channels',
    'slack',
    'public',
    true,
    '["Post","Search","Channels"]'::jsonb,
    'generic'
  ),
  (
    'github',
    'GitHub',
    'Engineering',
    'Repos, pull requests, and issues',
    'github',
    'public',
    true,
    '["Repos","PRs","Issues","Actions"]'::jsonb,
    'generic'
  ),
  (
    'gcal',
    'Google Calendar',
    'Productivity',
    'List and create events',
    'googlecalendar',
    'public',
    true,
    '["List events","Create","Update"]'::jsonb,
    'generic'
  ),
  (
    'stripe',
    'Stripe',
    'Commerce',
    'Customers, invoices, and balance',
    'stripe',
    'public',
    true,
    '["Customers","Invoices","Subscriptions","Balance"]'::jsonb,
    'generic'
  ),
  (
    'notion',
    'Notion',
    'Productivity',
    'Search pages and databases',
    'notion',
    'public',
    true,
    '["Pages","Search","Database"]'::jsonb,
    'generic'
  ),
  (
    'linear',
    'Linear',
    'Engineering',
    'Issues, projects, and comments',
    'linear',
    'public',
    true,
    '["Issues","Projects","Comments"]'::jsonb,
    'generic'
  ),
  (
    'figma',
    'Figma',
    'Productivity',
    'Files, comments, and export',
    'figma',
    'public',
    true,
    '["Files","Comments","Export"]'::jsonb,
    'generic'
  ),
  (
    'gdrive',
    'Google Drive',
    'Productivity',
    'Find and open files',
    'gdrive',
    'public',
    true,
    '["List","Search","Open"]'::jsonb,
    'generic'
  )
on conflict (id) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.connector_catalog enable row level security;
alter table public.connector_installations enable row level security;
alter table public.connector_accounts enable row level security;

create policy "connector_catalog_read"
  on public.connector_catalog for select
  to authenticated
  using (true);

create policy "connector_installations_own"
  on public.connector_installations for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "connector_installations_workspace_read"
  on public.connector_installations for select
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

create policy "connector_accounts_member"
  on public.connector_accounts for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

alter publication supabase_realtime add table public.connector_installations;
alter publication supabase_realtime add table public.connector_accounts;
