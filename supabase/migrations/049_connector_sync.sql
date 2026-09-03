-- Connector sync infrastructure + mail domain storage (Gmail / later Outlook).
-- Generic sync cursor lives in connector_sync_state.
-- Domain data lives in connector_mail_messages — not a mega connector_records blob.

-- ── connector_sync_state (generic infra) ─────────────────────────────────────
create table if not exists public.connector_sync_state (
  connection_id text primary key
    references public.connector_connections (id) on delete cascade,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  connector_id text not null references public.connector_catalog (id) on delete restrict,
  cursor text,
  provider_state jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  status text not null default 'idle'
    check (status in ('idle', 'running', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.connector_sync_state is
  'Per-connection sync cursor and status. Shared by all connector adapters; no domain payloads.';

create index if not exists connector_sync_state_owner_workspace_idx
  on public.connector_sync_state (owner_id, workspace_id);

alter table public.connector_sync_state enable row level security;

drop policy if exists "connector_sync_state_select_own" on public.connector_sync_state;
create policy "connector_sync_state_select_own"
  on public.connector_sync_state for select
  to authenticated
  using (
    owner_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

-- Clients never write sync state; service role / server API does.
revoke all on table public.connector_sync_state from anon;
revoke insert, update, delete on table public.connector_sync_state from authenticated;
grant select on table public.connector_sync_state to authenticated;

-- ── connector_mail_messages (mail domain) ────────────────────────────────────
create table if not exists public.connector_mail_messages (
  id text primary key,
  connection_id text not null
    references public.connector_connections (id) on delete cascade,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  connector_id text not null references public.connector_catalog (id) on delete restrict,
  provider_message_id text not null,
  thread_id text,
  from_addr text,
  to_addrs text[] not null default '{}',
  cc_addrs text[] not null default '{}',
  subject text,
  snippet text,
  received_at timestamptz,
  is_unread boolean not null default false,
  is_archived boolean not null default false,
  has_attachments boolean not null default false,
  raw_meta jsonb not null default '{}'::jsonb,
  -- Lazy-fetched body (null until user opens the message)
  body_text text,
  body_html text,
  body_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_message_id)
);

comment on table public.connector_mail_messages is
  'Normalized mail headers/snippets for Gmail (and later Outlook). Bodies are lazy-cached.';

create index if not exists connector_mail_messages_list_idx
  on public.connector_mail_messages (connection_id, received_at desc nulls last);

create index if not exists connector_mail_messages_unread_idx
  on public.connector_mail_messages (connection_id, is_unread)
  where is_unread = true and is_archived = false;

create index if not exists connector_mail_messages_owner_workspace_idx
  on public.connector_mail_messages (owner_id, workspace_id);

alter table public.connector_mail_messages enable row level security;

drop policy if exists "connector_mail_messages_select_own" on public.connector_mail_messages;
create policy "connector_mail_messages_select_own"
  on public.connector_mail_messages for select
  to authenticated
  using (
    owner_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

revoke all on table public.connector_mail_messages from anon;
revoke insert, update, delete on table public.connector_mail_messages from authenticated;
grant select on table public.connector_mail_messages to authenticated;

-- Persist connector chat linkage on threads (mirrors project_id).
alter table public.threads
  add column if not exists connector_id text;

create index if not exists threads_connector_idx
  on public.threads (workspace_id, connector_id)
  where connector_id is not null;
