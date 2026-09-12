-- Workspace-shared connector accounts: members can use a connection when
-- connection_mode = 'workspace_shared'. Owner still owns rename / disconnect /
-- share toggle / skill permissions. Limit counts all live owned accounts.

comment on column public.connector_connections.connection_mode is
  'personal = owner-only. workspace_shared = any workspace member may use this active account (tools/agents); only the owner may manage it.';

-- Unique Candor labels among all live owned accounts (shared or personal).
drop index if exists public.connector_connections_live_display_name_uidx;

create unique index if not exists connector_connections_live_display_name_uidx
  on public.connector_connections (
    workspace_id,
    owner_id,
    connector_id,
    lower(display_name)
  )
  where status in ('pending', 'active')
    and deleted_at is null;

create or replace function public.enforce_connector_connection_account_limit()
returns trigger
language plpgsql
as $$
declare
  live_count integer;
begin
  if new.status in ('pending', 'active')
     and new.deleted_at is null then
    select count(*)::integer into live_count
    from public.connector_connections
    where workspace_id = new.workspace_id
      and owner_id = new.owner_id
      and connector_id = new.connector_id
      and status in ('pending', 'active')
      and deleted_at is null
      and id is distinct from new.id;

    if live_count >= 3 then
      raise exception 'connector_connection_limit'
        using errcode = 'P0001',
              hint = 'Maximum of 3 accounts per connector in this workspace.';
    end if;
  end if;

  new.display_name := btrim(new.display_name);
  return new;
end;
$$;

-- Members may read public columns of active shared connections in workspaces
-- they belong to. Secrets remain service-role only (migration 050).
drop policy if exists "connector_connections_select_workspace_shared"
  on public.connector_connections;

create policy "connector_connections_select_workspace_shared"
  on public.connector_connections for select
  to authenticated
  using (
    connection_mode = 'workspace_shared'
    and status = 'active'
    and deleted_at is null
    and public.is_workspace_member(workspace_id)
  );

-- Owner may flip personal ↔ workspace_shared (insert still personal-only).
drop policy if exists "connector_connections_update_own"
  on public.connector_connections;

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
    and connection_mode in ('personal', 'workspace_shared')
  );
