-- Cander: connector connection lifecycle hardening
-- Run after 038_usage_protection.sql
--
-- Personal connections: owner_id = auth.uid() = profiles.id (1:1 with auth.users).
-- Workspace membership alone does NOT grant access to another member's connections.
-- v1 uniqueness: one live (pending or active) personal connection per
--   (workspace_id, owner_id, connector_id).

-- ── Catalog extensions (authoritative in Supabase mode) ───────────────────────
alter table public.connector_catalog
  add column if not exists display_order integer not null default 100,
  add column if not exists enabled boolean not null default true,
  add column if not exists coming_soon boolean not null default true,
  add column if not exists provider_toolkit_id text;

-- Authoritative v1 seed (all coming_soon until Composio mapping)
insert into public.connector_catalog
  (id, name, category, description, icon, scope, featured, actions, panel_type,
   display_order, enabled, coming_soon)
values
  (
    'gmail', 'Gmail', 'Productivity',
    'Search, read, draft, and send mail via MCP', 'gmail', 'public', true,
    '["Search","Read","Draft","Send","Labels","Filters"]'::jsonb, 'gmail',
    1, true, true
  ),
  (
    'slack', 'Slack', 'Productivity',
    'Search and post in channels', 'slack', 'public', true,
    '["Post","Search","Channels"]'::jsonb, 'generic',
    2, true, true
  ),
  (
    'github', 'GitHub', 'Engineering',
    'Repos, pull requests, and issues', 'github', 'public', true,
    '["Repos","PRs","Issues","Actions"]'::jsonb, 'generic',
    3, true, true
  ),
  (
    'gcal', 'Google Calendar', 'Productivity',
    'List and create events', 'googlecalendar', 'public', true,
    '["List events","Create","Update"]'::jsonb, 'generic',
    4, true, true
  ),
  (
    'notion', 'Notion', 'Productivity',
    'Search pages and databases', 'notion', 'public', true,
    '["Pages","Search","Database"]'::jsonb, 'generic',
    5, true, true
  ),
  (
    'stripe', 'Stripe', 'Commerce',
    'Customers, invoices, and balance', 'stripe', 'public', false,
    '["Customers","Invoices","Subscriptions","Balance"]'::jsonb, 'generic',
    6, true, true
  ),
  (
    'vercel', 'Vercel', 'Engineering',
    'Deployments and project settings', 'vercel', 'public', false,
    '["Deployments","Projects","Domains"]'::jsonb, 'generic',
    7, true, true
  )
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  icon = excluded.icon,
  featured = excluded.featured,
  display_order = excluded.display_order,
  enabled = excluded.enabled,
  coming_soon = excluded.coming_soon;

-- Deprecate legacy catalog rows (keep for FK safety)
update public.connector_catalog
set enabled = false, coming_soon = true
where id not in ('gmail', 'slack', 'github', 'gcal', 'notion', 'stripe', 'vercel');

-- ── connector_connections (authoritative live status) ─────────────────────────
create table if not exists public.connector_connections (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  connector_id text not null references public.connector_catalog (id) on delete restrict,
  connection_mode text not null default 'personal'
    check (connection_mode in ('personal', 'workspace_shared')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'failed', 'disconnected')),
  provider_connection_id text,
  provider_name text,
  failure_detail text,
  connected_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_sync_at timestamptz,
  pending_expires_at timestamptz,
  deleted_at timestamptz
);

comment on table public.connector_connections is
  'Authoritative connector connection lifecycle. Personal v1: owner_id = connecting user.';
comment on column public.connector_connections.connection_mode is
  'personal = owner-scoped (v1 only). workspace_shared reserved for future shared connections.';
comment on column public.connector_connections.owner_id is
  'Must equal auth.uid() on insert. Never accept from client.';

create index if not exists connector_connections_owner_workspace_idx
  on public.connector_connections (owner_id, workspace_id)
  where deleted_at is null;

create index if not exists connector_connections_workspace_connector_idx
  on public.connector_connections (workspace_id, connector_id)
  where deleted_at is null;

-- One live personal connection per user per workspace per connector (pending OR active)
create unique index if not exists connector_connections_one_live_personal_idx
  on public.connector_connections (workspace_id, owner_id, connector_id)
  where connection_mode = 'personal'
    and status in ('pending', 'active')
    and deleted_at is null;

drop trigger if exists connector_connections_updated_at on public.connector_connections;
create trigger connector_connections_updated_at
  before update on public.connector_connections
  for each row execute function public.set_updated_at();

-- ── Audit trail (owner-scoped reads) ──────────────────────────────────────────
create table if not exists public.connector_audit_events (
  id text primary key,
  workspace_id text not null,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  connection_id text references public.connector_connections (id) on delete set null,
  connector_id text,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists connector_audit_events_actor_idx
  on public.connector_audit_events (actor_id, created_at desc);

comment on table public.connector_audit_events is
  'Allowlisted lifecycle audit. Never store tokens, OAuth payloads, emails, or labels.';

-- ── Deprecate connector_accounts (do NOT migrate as live) ─────────────────────
comment on table public.connector_accounts is
  'DEPRECATED: browser-authoritative mock data. Not used for live connection status.';

drop policy if exists "connector_accounts_member" on public.connector_accounts;

revoke insert, update, delete on public.connector_accounts from authenticated;

-- ── Harden connector_installations ──────────────────────────────────────────
drop policy if exists "connector_installations_own" on public.connector_installations;
drop policy if exists "connector_installations_workspace_read" on public.connector_installations;

create policy "connector_installations_select"
  on public.connector_installations for select
  to authenticated
  using (
    profile_id = auth.uid()
    or (
      workspace_id is not null
      and public.is_workspace_member(workspace_id)
    )
  );

create policy "connector_installations_insert"
  on public.connector_installations for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and (
      workspace_id is null
      or public.is_workspace_member(workspace_id)
    )
  );

create policy "connector_installations_update"
  on public.connector_installations for update
  to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and (
      workspace_id is null
      or public.is_workspace_member(workspace_id)
    )
  );

create policy "connector_installations_delete"
  on public.connector_installations for delete
  to authenticated
  using (profile_id = auth.uid());

-- ── connector_connections RLS ───────────────────────────────────────────────
alter table public.connector_connections enable row level security;
alter table public.connector_audit_events enable row level security;

create policy "connector_connections_select_own"
  on public.connector_connections for select
  to authenticated
  using (
    owner_id = auth.uid()
    and public.is_workspace_member(workspace_id)
    and deleted_at is null
  );

create policy "connector_connections_insert_own"
  on public.connector_connections for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and connected_by = auth.uid()
    and public.is_workspace_member(workspace_id)
    and connection_mode = 'personal'
  );

create policy "connector_connections_update_own"
  on public.connector_connections for update
  to authenticated
  using (
    owner_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  )
  with check (
    owner_id = auth.uid()
    and connected_by = auth.uid()
  );

create policy "connector_connections_delete_own"
  on public.connector_connections for delete
  to authenticated
  using (
    owner_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

create policy "connector_audit_events_select_own"
  on public.connector_audit_events for select
  to authenticated
  using (actor_id = auth.uid());

create policy "connector_audit_events_insert_own"
  on public.connector_audit_events for insert
  to authenticated
  with check (actor_id = auth.uid());

alter publication supabase_realtime add table public.connector_connections;
