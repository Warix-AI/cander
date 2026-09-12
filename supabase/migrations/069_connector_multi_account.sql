-- Multi-account connectors: display names, up to 3 live personal connections
-- per (workspace, owner, connector). Existing singles backfill cleanly.

alter table public.connector_connections
  add column if not exists display_name text;

-- Existing live rows get a stable Candor label (not a provider identity).
update public.connector_connections
set display_name = 'Account'
where display_name is null
  or btrim(display_name) = '';

alter table public.connector_connections
  alter column display_name set default 'Account',
  alter column display_name set not null;

alter table public.connector_connections
  drop constraint if exists connector_connections_display_name_len;

alter table public.connector_connections
  add constraint connector_connections_display_name_len
  check (
    char_length(btrim(display_name)) between 1 and 10
    and display_name = btrim(display_name)
  );

-- Drop one-live uniqueness so multiple accounts can coexist.
drop index if exists public.connector_connections_one_live_personal_idx;

-- Unique Candor display name per owner + connector + workspace among live rows.
create unique index if not exists connector_connections_live_display_name_uidx
  on public.connector_connections (
    workspace_id,
    owner_id,
    connector_id,
    lower(display_name)
  )
  where connection_mode = 'personal'
    and status in ('pending', 'active')
    and deleted_at is null;

create or replace function public.enforce_connector_connection_account_limit()
returns trigger
language plpgsql
as $$
declare
  live_count integer;
begin
  if new.connection_mode = 'personal'
     and new.status in ('pending', 'active')
     and new.deleted_at is null then
    select count(*)::integer into live_count
    from public.connector_connections
    where workspace_id = new.workspace_id
      and owner_id = new.owner_id
      and connector_id = new.connector_id
      and connection_mode = 'personal'
      and status in ('pending', 'active')
      and deleted_at is null
      and id is distinct from new.id;

    if live_count >= 3 then
      raise exception 'connector_connection_limit'
        using errcode = 'P0001',
              hint = 'Maximum of 3 accounts per connector in this workspace.';
    end if;
  end if;

  -- Normalize display_name on write.
  new.display_name := btrim(new.display_name);
  return new;
end;
$$;

drop trigger if exists trg_connector_connection_account_limit
  on public.connector_connections;

create trigger trg_connector_connection_account_limit
  before insert or update of status, deleted_at, connection_mode, display_name, workspace_id, owner_id, connector_id
  on public.connector_connections
  for each row
  execute function public.enforce_connector_connection_account_limit();

comment on column public.connector_connections.display_name is
  'Candor-only account label (1–10 chars). Never a provider identity.';
