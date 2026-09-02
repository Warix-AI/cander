-- Sanitize Realtime for connector connections: never ship provider_connection_id
-- to browsers. Keep connector_connections for server use; publish only a thin
-- signal table that triggers client re-hydrate via the HTTP API.

-- 1) Stop publishing the sensitive table
do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'connector_connections'
  ) then
    alter publication supabase_realtime drop table public.connector_connections;
  end if;
end $$;

-- 2) Thin Realtime signal table (no provider secrets)
create table if not exists public.connector_connection_signals (
  connection_id text primary key
    references public.connector_connections (id) on delete cascade,
  workspace_id text not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  connector_id text not null,
  status text not null,
  updated_at timestamptz not null default now()
);

create index if not exists connector_connection_signals_owner_idx
  on public.connector_connection_signals (owner_id);

comment on table public.connector_connection_signals is
  'Sanitized Realtime invalidation rows for connector_connections. Never stores provider_connection_id.';

alter table public.connector_connection_signals enable row level security;

drop policy if exists "connector_connection_signals_select_own"
  on public.connector_connection_signals;
create policy "connector_connection_signals_select_own"
  on public.connector_connection_signals for select
  to authenticated
  using (
    owner_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

-- Authenticated clients may only SELECT; writes come from trigger (security definer).
revoke all on table public.connector_connection_signals from anon;
revoke insert, update, delete on table public.connector_connection_signals from authenticated;
grant select on table public.connector_connection_signals to authenticated;

create or replace function public.sync_connector_connection_signal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.connector_connection_signals
    where connection_id = old.id;
    return old;
  end if;

  if new.deleted_at is not null then
    delete from public.connector_connection_signals
    where connection_id = new.id;
    return new;
  end if;

  insert into public.connector_connection_signals as s (
    connection_id,
    workspace_id,
    owner_id,
    connector_id,
    status,
    updated_at
  )
  values (
    new.id,
    new.workspace_id,
    new.owner_id,
    new.connector_id,
    new.status,
    now()
  )
  on conflict (connection_id) do update set
    workspace_id = excluded.workspace_id,
    owner_id = excluded.owner_id,
    connector_id = excluded.connector_id,
    status = excluded.status,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

revoke all on function public.sync_connector_connection_signal() from public;
revoke all on function public.sync_connector_connection_signal() from anon, authenticated;

drop trigger if exists connector_connections_sync_signal
  on public.connector_connections;
create trigger connector_connections_sync_signal
  after insert or update or delete on public.connector_connections
  for each row execute function public.sync_connector_connection_signal();

-- Backfill live rows
insert into public.connector_connection_signals (
  connection_id,
  workspace_id,
  owner_id,
  connector_id,
  status,
  updated_at
)
select
  id,
  workspace_id,
  owner_id,
  connector_id,
  status,
  coalesce(updated_at, now())
from public.connector_connections
where deleted_at is null
on conflict (connection_id) do update set
  workspace_id = excluded.workspace_id,
  owner_id = excluded.owner_id,
  connector_id = excluded.connector_id,
  status = excluded.status,
  updated_at = excluded.updated_at;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'connector_connection_signals'
  ) then
    alter publication supabase_realtime
      add table public.connector_connection_signals;
  end if;
end $$;
