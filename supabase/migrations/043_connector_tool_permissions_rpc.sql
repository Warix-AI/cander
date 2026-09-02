-- Owner-scoped RPC to persist tool_permissions without RLS with-check edge cases.

create or replace function public.update_connector_tool_permissions(
  p_connection_id text,
  p_workspace_id text,
  p_permissions jsonb
)
returns public.connector_connections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.connector_connections;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Workspace access denied';
  end if;

  select * into v_row
  from public.connector_connections
  where id = p_connection_id
    and workspace_id = p_workspace_id
    and owner_id = v_uid
    and status = 'active'
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Connection not found';
  end if;

  update public.connector_connections
  set
    tool_permissions = p_permissions,
    updated_at = now()
  where id = p_connection_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.update_connector_tool_permissions(text, text, jsonb) from public;
grant execute on function public.update_connector_tool_permissions(text, text, jsonb) to authenticated;
