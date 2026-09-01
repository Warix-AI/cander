-- Durable usage ledger, rate-limit counters, and audit log.
-- Run after 037_image_generation_jobs.sql

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  feature_category text not null,
  provider text,
  model text,
  units numeric not null default 0,
  unit_kind text not null default 'requests',
  estimated_cost_micros bigint not null default 0,
  actual_cost_micros bigint,
  status text not null default 'reserved',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usage_events_status_check check (
    status in ('reserved', 'confirmed', 'released', 'failed')
  ),
  constraint usage_events_workspace_idempotency unique (workspace_id, idempotency_key)
);

create index if not exists usage_events_workspace_created_idx
  on public.usage_events (workspace_id, created_at desc);

create index if not exists usage_events_profile_created_idx
  on public.usage_events (profile_id, created_at desc)
  where profile_id is not null;

create index if not exists usage_events_active_reservations_idx
  on public.usage_events (workspace_id, feature_category, status)
  where status = 'reserved';

create table if not exists public.usage_window_counters (
  workspace_id text not null references public.workspaces (id) on delete cascade,
  profile_id text not null default '',
  feature_category text not null,
  window_kind text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  units numeric not null default 0,
  cost_micros bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (
    workspace_id,
    profile_id,
    feature_category,
    window_kind,
    window_start
  )
);

create index if not exists usage_window_counters_lookup_idx
  on public.usage_window_counters (workspace_id, feature_category, window_kind, window_start);

create table if not exists public.usage_audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id text references public.workspaces (id) on delete set null,
  profile_id uuid references public.profiles (id) on delete set null,
  feature_category text,
  decision text not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_audit_log_workspace_created_idx
  on public.usage_audit_log (workspace_id, created_at desc);

create or replace function public.increment_usage_window_counter(
  p_workspace_id text,
  p_profile_id text,
  p_feature_category text,
  p_window_kind text,
  p_window_start timestamptz,
  p_request_delta integer default 0,
  p_units_delta numeric default 0,
  p_cost_micros_delta bigint default 0
)
returns public.usage_window_counters
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.usage_window_counters;
begin
  insert into public.usage_window_counters as c (
    workspace_id,
    profile_id,
    feature_category,
    window_kind,
    window_start,
    request_count,
    units,
    cost_micros
  )
  values (
    p_workspace_id,
    coalesce(p_profile_id, ''),
    p_feature_category,
    p_window_kind,
    p_window_start,
    greatest(p_request_delta, 0),
    greatest(p_units_delta, 0),
    greatest(p_cost_micros_delta, 0)
  )
  on conflict on constraint usage_window_counters_pkey do update
  set
    request_count = c.request_count + greatest(p_request_delta, 0),
    units = c.units + greatest(p_units_delta, 0),
    cost_micros = c.cost_micros + greatest(p_cost_micros_delta, 0),
    updated_at = now()
  returning * into result;
  return result;
end;
$$;

revoke all on function public.increment_usage_window_counter(
  text, text, text, text, timestamptz, integer, numeric, bigint
) from public;
grant execute on function public.increment_usage_window_counter(
  text, text, text, text, timestamptz, integer, numeric, bigint
) to service_role;

alter table public.usage_events enable row level security;
alter table public.usage_window_counters enable row level security;
alter table public.usage_audit_log enable row level security;

revoke all on table public.usage_events from anon, authenticated;
revoke all on table public.usage_window_counters from anon, authenticated;
revoke all on table public.usage_audit_log from anon, authenticated;

grant all on table public.usage_events to service_role;
grant all on table public.usage_window_counters to service_role;
grant all on table public.usage_audit_log to service_role;
