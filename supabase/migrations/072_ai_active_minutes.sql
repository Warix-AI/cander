-- Universal AI active-minute ledger.
-- User-facing unit = AI minutes; internal economics = USD cost fields.
-- Historical usage_events (request/$) remain for fair-use enforcement;
-- this ledger is the canonical source for visible AI-minute usage.

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id text references public.workspaces (id) on delete set null,
  subscription_id text,
  plan_id text not null,
  execution_id uuid not null,
  parent_execution_id uuid,
  source text not null,
  feature text not null,
  model text,
  provider text,
  started_at timestamptz not null,
  ended_at timestamptz,
  active_duration_ms bigint,
  active_minutes numeric(18, 6),
  estimated_cost_usd numeric(18, 8),
  actual_cost_usd numeric(18, 8),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'cancelled', 'interrupted')),
  -- Root / user-visible spans contribute to minute balance.
  -- Nested child ops are cost-only and must not inflate overlapping wall-clock minutes.
  billable_to_user boolean not null default true,
  period_id uuid references public.account_usage_periods (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_usage_events_execution_unique unique (execution_id),
  constraint ai_usage_events_duration_check check (
    active_duration_ms is null or active_duration_ms >= 0
  )
);

create index if not exists ai_usage_events_user_started_idx
  on public.ai_usage_events (user_id, started_at desc);

create index if not exists ai_usage_events_period_billable_idx
  on public.ai_usage_events (period_id, billable_to_user, started_at)
  where period_id is not null;

create index if not exists ai_usage_events_parent_idx
  on public.ai_usage_events (parent_execution_id)
  where parent_execution_id is not null;

create index if not exists ai_usage_events_running_idx
  on public.ai_usage_events (user_id, status)
  where status = 'running';

drop trigger if exists ai_usage_events_updated_at on public.ai_usage_events;
create trigger ai_usage_events_updated_at
  before update on public.ai_usage_events
  for each row execute function public.set_updated_at();

-- Fast reconstructable period aggregates (source of truth remains ai_usage_events).
create table if not exists public.ai_usage_period_aggregates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  period_id uuid not null references public.account_usage_periods (id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  plan_id text not null,
  included_minutes numeric(18, 4) not null,
  -- Merged wall-clock active AI time for billable root executions.
  used_billable_ms bigint not null default 0,
  used_minutes numeric(18, 6) not null default 0,
  estimated_cost_usd numeric(18, 8) not null default 0,
  actual_cost_usd numeric(18, 8) not null default 0,
  event_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (period_id)
);

create index if not exists ai_usage_period_aggregates_profile_idx
  on public.ai_usage_period_aggregates (profile_id, period_start desc);

drop trigger if exists ai_usage_period_aggregates_updated_at on public.ai_usage_period_aggregates;
create trigger ai_usage_period_aggregates_updated_at
  before update on public.ai_usage_period_aggregates
  for each row execute function public.set_updated_at();

-- Snapshot included minutes onto account periods when created (plan config may change later).
alter table public.account_usage_periods
  add column if not exists included_minutes numeric(18, 4);

alter table public.account_usage_periods
  add column if not exists usage_limit_behavior text
    check (usage_limit_behavior is null or usage_limit_behavior in ('soft', 'hard'));

revoke all on public.ai_usage_events from authenticated, anon;
revoke all on public.ai_usage_period_aggregates from authenticated, anon;
grant all on public.ai_usage_events to service_role;
grant all on public.ai_usage_period_aggregates to service_role;

alter table public.ai_usage_events enable row level security;
alter table public.ai_usage_period_aggregates enable row level security;
