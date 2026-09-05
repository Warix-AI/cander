-- M3: authenticated clients must not SELECT provider secret columns.
-- provider_connection_id is a Composio account ref (not a bearer token) but
-- still server-only. composio_user_id is similarly internal.
--
-- Service role retains full table SELECT. Authenticated/anon keep SELECT on
-- public lifecycle columns only (explicit grant after table-level revoke).

revoke select on table public.connector_connections from anon, authenticated;

grant select (
  id,
  workspace_id,
  owner_id,
  connector_id,
  connection_mode,
  status,
  provider_name,
  failure_detail,
  connected_by,
  created_at,
  updated_at,
  connected_at,
  disconnected_at,
  last_sync_at,
  pending_expires_at,
  deleted_at,
  tool_permissions
) on table public.connector_connections to authenticated;

-- Preserve write privileges used by user-scoped lifecycle (RLS still applies).
grant insert, update, delete on table public.connector_connections to authenticated;

comment on column public.connector_connections.provider_connection_id is
  'Composio connected-account id. Service-role SELECT only; never expose via PostgREST to authenticated clients.';

comment on column public.connector_connections.composio_user_id is
  'Internal Composio user key. Service-role SELECT only.';
