-- Connector Composio prep: OAuth state binding, webhook receipts, safe reconcile RPC,
-- RLS hardening, legacy connector_accounts lockdown.
-- Run after 039_connector_hardening.sql

-- ── OAuth state (server-only; no client RLS policies) ───────────────────────
create table if not exists public.connector_oauth_states (
  id text primary key,
  connection_id text not null references public.connector_connections (id) on delete cascade,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  connector_id text not null references public.connector_catalog (id) on delete restrict,
  composio_user_id text not null,
  link_session_ref text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists connector_oauth_states_connection_idx
  on public.connector_oauth_states (connection_id)
  where consumed_at is null;

create index if not exists connector_oauth_states_owner_idx
  on public.connector_oauth_states (owner_id, created_at desc);

comment on table public.connector_oauth_states is
  'Server-only OAuth state for Composio callback identity verification. No client access.';

alter table public.connector_oauth_states enable row level security;

-- ── Webhook idempotency receipts ────────────────────────────────────────────
create table if not exists public.connector_webhook_receipts (
  provider text not null,
  event_id text not null,
  connection_id text references public.connector_connections (id) on delete set null,
  processed_at timestamptz not null default now(),
  primary key (provider, event_id)
);

comment on table public.connector_webhook_receipts is
  'Idempotent webhook processing; never store raw webhook bodies.';

alter table public.connector_webhook_receipts enable row level security;

-- ── Composio user id on connections (server reconciliation only) ─────────────
alter table public.connector_connections
  add column if not exists composio_user_id text;

-- ── Harden connector_connections UPDATE policy ──────────────────────────────
drop policy if exists "connector_connections_update_own" on public.connector_connections;

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
    and public.is_workspace_member(workspace_id)
  );

-- Block client-side promotion to active or provider ref mutation
create or replace function public.connector_connections_block_client_promotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('role', true) = 'authenticated'
     or current_user in ('authenticated', 'anon') then
    if new.status = 'active' and (old.status is distinct from 'active') then
      raise exception 'Cannot activate connection from client';
    end if;
    if new.provider_connection_id is distinct from old.provider_connection_id then
      raise exception 'Cannot modify provider connection reference from client';
    end if;
    if new.owner_id is distinct from old.owner_id
       or new.workspace_id is distinct from old.workspace_id
       or new.connector_id is distinct from old.connector_id then
      raise exception 'Cannot reassign connection identity from client';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists connector_connections_block_client_promotion
  on public.connector_connections;
create trigger connector_connections_block_client_promotion
  before update on public.connector_connections
  for each row execute function public.connector_connections_block_client_promotion();

-- ── Safe reconcile RPC (service_role only) ────────────────────────────────────
create or replace function public.reconcile_connector_connection(
  p_connection_id text,
  p_target_status text,
  p_provider_connection_id text default null,
  p_composio_user_id text default null,
  p_failure_detail text default null
)
returns public.connector_connections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.connector_connections;
begin
  select * into v_row
  from public.connector_connections
  where id = p_connection_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Connection not found';
  end if;

  if p_target_status = 'active' then
    if v_row.status not in ('pending', 'active') then
      raise exception 'Invalid transition to active';
    end if;
    if p_provider_connection_id is null or p_provider_connection_id = '' then
      raise exception 'Provider connection id required for active';
    end if;
    if p_composio_user_id is not null
       and v_row.composio_user_id is not null
       and v_row.composio_user_id <> p_composio_user_id then
      raise exception 'Composio user mismatch';
    end if;
    update public.connector_connections
    set
      status = 'active',
      provider_connection_id = p_provider_connection_id,
      provider_name = 'composio',
      composio_user_id = coalesce(p_composio_user_id, v_row.composio_user_id),
      connected_at = coalesce(connected_at, now()),
      pending_expires_at = null,
      failure_detail = null,
      updated_at = now()
    where id = p_connection_id
    returning * into v_row;
    return v_row;
  end if;

  if p_target_status = 'disconnected' then
    if v_row.status = 'disconnected' then
      return v_row;
    end if;
    update public.connector_connections
    set
      status = 'disconnected',
      disconnected_at = coalesce(disconnected_at, now()),
      pending_expires_at = null,
      updated_at = now()
    where id = p_connection_id
    returning * into v_row;
    return v_row;
  end if;

  if p_target_status = 'failed' then
    update public.connector_connections
    set
      status = 'failed',
      failure_detail = coalesce(p_failure_detail, failure_detail, 'Connection failed.'),
      pending_expires_at = null,
      updated_at = now()
    where id = p_connection_id
    returning * into v_row;
    return v_row;
  end if;

  raise exception 'Unsupported target status';
end;
$$;

revoke all on function public.reconcile_connector_connection(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.reconcile_connector_connection(text, text, text, text, text)
  to service_role;

-- ── Legacy connector_accounts lockdown ──────────────────────────────────────
revoke select on public.connector_accounts from authenticated;

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'connector_accounts'
  ) then
    alter publication supabase_realtime drop table public.connector_accounts;
  end if;
exception
  when others then null;
end $$;

comment on table public.connector_accounts is
  'DEPRECATED: browser-authoritative mock data. Not used for live connection status. SELECT revoked for authenticated.';

-- Gmail toolkit mapping (remain disabled until pilot checklist passes)
update public.connector_catalog
set provider_toolkit_id = 'gmail'
where id = 'gmail';
