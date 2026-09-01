-- OAuth callback resilience: lifecycle states, atomic completion, hardened reconcile.
-- Run after 040_connector_composio_prep.sql

-- ── OAuth state lifecycle columns ───────────────────────────────────────────
alter table public.connector_oauth_states
  add column if not exists lifecycle_status text not null default 'pending',
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_expires_at timestamptz,
  add column if not exists verified_provider_connection_id text,
  add column if not exists failure_detail text;

alter table public.connector_oauth_states
  drop constraint if exists connector_oauth_states_lifecycle_status_check;

alter table public.connector_oauth_states
  add constraint connector_oauth_states_lifecycle_status_check
  check (lifecycle_status in ('pending', 'processing', 'consumed', 'failed'));

update public.connector_oauth_states
set lifecycle_status = case
  when consumed_at is not null then 'consumed'
  else coalesce(lifecycle_status, 'pending')
end;

create index if not exists connector_oauth_states_processing_lease_idx
  on public.connector_oauth_states (lifecycle_status, processing_expires_at)
  where lifecycle_status = 'processing';

comment on column public.connector_oauth_states.lifecycle_status is
  'pending | processing | consumed | failed — server-only callback lifecycle';

-- ── Harden reconcile: block pending activation except via callback RPC ────────
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
set search_path = pg_catalog, public
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
    raise exception 'Pending activation must use complete_connector_oauth_callback';
  end if;

  if p_target_status = 'disconnected' then
    if v_row.status = 'disconnected' then
      return v_row;
    end if;
    update public.connector_connections
    set
      status = 'disconnected',
      disconnected_at = coalesce(disconnected_at, pg_catalog.now()),
      pending_expires_at = null,
      updated_at = pg_catalog.now()
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
      updated_at = pg_catalog.now()
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

-- ── Atomically claim pending OAuth state before Composio call ───────────────
create or replace function public.claim_connector_oauth_state_for_callback(
  p_owner_id uuid,
  p_lease_seconds integer default 120
)
returns public.connector_oauth_states
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state public.connector_oauth_states;
  v_conn public.connector_connections;
  v_now timestamptz := pg_catalog.now();
  v_lease timestamptz := pg_catalog.now() + make_interval(secs => greatest(p_lease_seconds, 30));
begin
  select s.* into v_state
  from public.connector_oauth_states s
  where s.owner_id = p_owner_id
    and s.lifecycle_status in ('pending', 'processing')
    and s.consumed_at is null
    and s.expires_at > v_now
  order by s.created_at desc
  limit 1
  for update skip locked;

  if not found then
    raise exception 'OAuth state not found';
  end if;

  if v_state.lifecycle_status = 'processing'
     and v_state.processing_expires_at is not null
     and v_state.processing_expires_at > v_now then
    raise exception 'OAuth state already processing';
  end if;

  select * into v_conn
  from public.connector_connections
  where id = v_state.connection_id
    and owner_id = v_state.owner_id
    and workspace_id = v_state.workspace_id
    and connector_id = v_state.connector_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Connection binding invalid';
  end if;

  if v_conn.status = 'active'
     and v_conn.provider_connection_id is not null
     and (
       v_state.verified_provider_connection_id is null
       or v_conn.provider_connection_id = v_state.verified_provider_connection_id
     ) then
    update public.connector_oauth_states
    set
      lifecycle_status = 'consumed',
      consumed_at = coalesce(consumed_at, v_now),
      processing_started_at = null,
      processing_expires_at = null
    where id = v_state.id
    returning * into v_state;
    return v_state;
  end if;

  if v_conn.status <> 'pending' then
    raise exception 'Connection not pending';
  end if;

  update public.connector_oauth_states
  set
    lifecycle_status = 'processing',
    processing_started_at = v_now,
    processing_expires_at = v_lease,
    failure_detail = null
  where id = v_state.id
    and lifecycle_status in ('pending', 'processing')
    and consumed_at is null
  returning * into v_state;

  if not found then
    raise exception 'OAuth state claim failed';
  end if;

  return v_state;
end;
$$;

revoke all on function public.claim_connector_oauth_state_for_callback(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_connector_oauth_state_for_callback(uuid, integer)
  to service_role;

-- ── Record verified provider ref after Composio success (pre-atomic persist) ──
create or replace function public.record_connector_oauth_verification(
  p_oauth_state_id text,
  p_owner_id uuid,
  p_provider_connection_id text
)
returns public.connector_oauth_states
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state public.connector_oauth_states;
begin
  if p_provider_connection_id is null or btrim(p_provider_connection_id) = '' then
    raise exception 'Provider connection id required';
  end if;

  update public.connector_oauth_states s
  set
    verified_provider_connection_id = p_provider_connection_id
  where s.id = p_oauth_state_id
    and s.owner_id = p_owner_id
    and s.lifecycle_status = 'processing'
    and s.consumed_at is null
    and (
      s.link_session_ref is null
      or s.link_session_ref = p_provider_connection_id
    )
  returning * into v_state;

  if not found then
    raise exception 'OAuth verification record failed';
  end if;

  return v_state;
end;
$$;

revoke all on function public.record_connector_oauth_verification(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_connector_oauth_verification(text, uuid, text)
  to service_role;

-- ── Atomic callback completion: connection + oauth consumed + audit ─────────
create or replace function public.complete_connector_oauth_callback(
  p_oauth_state_id text,
  p_owner_id uuid,
  p_provider_connection_id text,
  p_composio_user_id text
)
returns public.connector_connections
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state public.connector_oauth_states;
  v_conn public.connector_connections;
  v_now timestamptz := pg_catalog.now();
  v_audit_id text;
begin
  if p_provider_connection_id is null or btrim(p_provider_connection_id) = '' then
    raise exception 'Provider connection id required';
  end if;
  if p_composio_user_id is null or btrim(p_composio_user_id) = '' then
    raise exception 'Composio user id required';
  end if;

  select * into v_state
  from public.connector_oauth_states
  where id = p_oauth_state_id
    and owner_id = p_owner_id
    and lifecycle_status in ('processing', 'consumed')
    and consumed_at is null
  for update;

  if not found then
    select * into v_state
    from public.connector_oauth_states
    where id = p_oauth_state_id
      and owner_id = p_owner_id
      and lifecycle_status = 'consumed';
    if found then
      select * into v_conn
      from public.connector_connections
      where id = v_state.connection_id
        and deleted_at is null;
      if found then
        return v_conn;
      end if;
    end if;
    raise exception 'OAuth state not completable';
  end if;

  if v_state.composio_user_id <> p_composio_user_id then
    raise exception 'Composio user mismatch';
  end if;

  if v_state.verified_provider_connection_id is not null
     and v_state.verified_provider_connection_id <> p_provider_connection_id then
    raise exception 'Provider connection mismatch';
  end if;

  if v_state.link_session_ref is not null
     and v_state.link_session_ref <> p_provider_connection_id then
    raise exception 'Link session mismatch';
  end if;

  select * into v_conn
  from public.connector_connections
  where id = v_state.connection_id
    and owner_id = v_state.owner_id
    and workspace_id = v_state.workspace_id
    and connector_id = v_state.connector_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Connection binding invalid';
  end if;

  if v_conn.status = 'active'
     and v_conn.provider_connection_id = p_provider_connection_id then
    update public.connector_oauth_states
    set
      lifecycle_status = 'consumed',
      consumed_at = coalesce(consumed_at, v_now),
      verified_provider_connection_id = p_provider_connection_id,
      processing_started_at = null,
      processing_expires_at = null
    where id = v_state.id;
    return v_conn;
  end if;

  if v_conn.status <> 'pending' then
    raise exception 'Invalid transition to active';
  end if;

  if v_conn.composio_user_id is not null
     and v_conn.composio_user_id <> p_composio_user_id then
    raise exception 'Composio user mismatch on connection';
  end if;

  update public.connector_connections
  set
    status = 'active',
    provider_connection_id = p_provider_connection_id,
    provider_name = 'composio',
    composio_user_id = p_composio_user_id,
    connected_at = coalesce(connected_at, v_now),
    pending_expires_at = null,
    failure_detail = null,
    updated_at = v_now
  where id = v_conn.id
  returning * into v_conn;

  update public.connector_oauth_states
  set
    lifecycle_status = 'consumed',
    consumed_at = v_now,
    verified_provider_connection_id = p_provider_connection_id,
    processing_started_at = null,
    processing_expires_at = null,
    failure_detail = null
  where id = v_state.id;

  v_audit_id := 'ca_' || replace(pg_catalog.gen_random_uuid()::text, '-', '');

  insert into public.connector_audit_events (
    id,
    workspace_id,
    actor_id,
    connection_id,
    connector_id,
    event_type,
    detail
  )
  values (
    v_audit_id,
    v_state.workspace_id,
    p_owner_id,
    v_conn.id,
    v_state.connector_id,
    'connection_initiated',
    jsonb_build_object(
      'reason_code', 'activated',
      'connector_id', v_state.connector_id,
      'connection_id', v_conn.id,
      'workspace_id', v_state.workspace_id
    )
  );

  return v_conn;
end;
$$;

revoke all on function public.complete_connector_oauth_callback(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_connector_oauth_callback(text, uuid, text, text)
  to service_role;

-- ── Fail OAuth state + optional connection failure ────────────────────────────
create or replace function public.fail_connector_oauth_state(
  p_oauth_state_id text,
  p_owner_id uuid,
  p_failure_detail text default 'Authorization could not be verified.'
)
returns public.connector_oauth_states
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state public.connector_oauth_states;
  v_now timestamptz := pg_catalog.now();
begin
  update public.connector_oauth_states s
  set
    lifecycle_status = 'failed',
    failure_detail = left(coalesce(p_failure_detail, 'Authorization could not be verified.'), 500),
    processing_started_at = null,
    processing_expires_at = null,
    consumed_at = coalesce(consumed_at, v_now)
  where s.id = p_oauth_state_id
    and s.owner_id = p_owner_id
    and s.lifecycle_status in ('pending', 'processing')
  returning * into v_state;

  if not found then
    raise exception 'OAuth state not found';
  end if;

  update public.connector_connections c
  set
    status = 'failed',
    failure_detail = left(coalesce(p_failure_detail, 'Authorization could not be verified.'), 500),
    pending_expires_at = null,
    updated_at = v_now
  where c.id = v_state.connection_id
    and c.owner_id = p_owner_id
    and c.status = 'pending';

  return v_state;
end;
$$;

revoke all on function public.fail_connector_oauth_state(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fail_connector_oauth_state(text, uuid, text)
  to service_role;

-- ── Release expired processing lease back to pending when safe ────────────────
create or replace function public.release_expired_connector_oauth_processing(
  p_oauth_state_id text
)
returns public.connector_oauth_states
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state public.connector_oauth_states;
  v_now timestamptz := pg_catalog.now();
begin
  update public.connector_oauth_states s
  set
    lifecycle_status = case
      when s.verified_provider_connection_id is not null then 'processing'
      else 'pending'
    end,
    processing_started_at = case
      when s.verified_provider_connection_id is not null then s.processing_started_at
      else null
    end,
    processing_expires_at = case
      when s.verified_provider_connection_id is not null then s.processing_expires_at
      else null
    end
  where s.id = p_oauth_state_id
    and s.lifecycle_status = 'processing'
    and s.consumed_at is null
    and s.processing_expires_at is not null
    and s.processing_expires_at <= v_now
  returning * into v_state;

  if not found then
    raise exception 'OAuth state not releasable';
  end if;

  return v_state;
end;
$$;

revoke all on function public.release_expired_connector_oauth_processing(text)
  from public, anon, authenticated;
grant execute on function public.release_expired_connector_oauth_processing(text)
  to service_role;

-- ── List stale processing states for server recovery ────────────────────────
create or replace function public.list_recoverable_connector_oauth_states(
  p_limit integer default 20
)
returns setof public.connector_oauth_states
language sql
security definer
set search_path = pg_catalog, public
as $$
  select s.*
  from public.connector_oauth_states s
  where s.lifecycle_status = 'processing'
    and s.consumed_at is null
    and s.expires_at > pg_catalog.now()
    and (
      s.verified_provider_connection_id is not null
      or (
        s.processing_expires_at is not null
        and s.processing_expires_at <= pg_catalog.now()
      )
    )
  order by s.processing_started_at asc nulls last
  limit greatest(p_limit, 1);
$$;

revoke all on function public.list_recoverable_connector_oauth_states(integer)
  from public, anon, authenticated;
grant execute on function public.list_recoverable_connector_oauth_states(integer)
  to service_role;
