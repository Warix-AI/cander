-- Grant Candor display_name to authenticated clients.
-- Migration 050 uses explicit column SELECT grants; adding display_name without
-- re-granting made connection list queries fail (500) and hid Connected state.

grant select (display_name) on table public.connector_connections to authenticated;

-- Ensure owners can rename via user-scoped UPDATE (RLS still applies).
grant update (display_name) on table public.connector_connections to authenticated;
