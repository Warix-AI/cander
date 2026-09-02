-- Per-connection AI tool permissions (read/write toggles per connector).

alter table public.connector_connections
  add column if not exists tool_permissions jsonb not null default '{}'::jsonb;

comment on column public.connector_connections.tool_permissions is
  'Owner-controlled map of connector tool id → enabled. Empty object uses catalog defaults (read on, write off).';
