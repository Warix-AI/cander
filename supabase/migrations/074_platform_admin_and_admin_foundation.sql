-- Platform admin gate + admin audit / overrides / pricing foundations.
-- Does not rewrite open account_usage_periods snapshots.

-- Durable platform-admin flag (separate from org Owner/Admin).
alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false;

comment on column public.profiles.is_platform_admin is
  'Platform operator. Never granted by org Owner/Admin roles.';

-- Append-only platform admin audit log.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  before jsonb,
  after jsonb,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);

create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log (actor_id, created_at desc);

create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_type, target_id, created_at desc);

revoke all on public.admin_audit_log from authenticated, anon;
grant all on public.admin_audit_log to service_role;
alter table public.admin_audit_log enable row level security;

-- Immutable account override history (effective values also mirrored on profiles).
create table if not exists public.admin_account_overrides (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  ai_minutes_override numeric(18, 4),
  ai_minutes_plan text
    check (
      ai_minutes_plan is null
      or ai_minutes_plan in ('free', 'pro', 'max', 'ultra', 'enterprise')
    ),
  reason text,
  effective_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_account_overrides_profile_idx
  on public.admin_account_overrides (profile_id, created_at desc);

create index if not exists admin_account_overrides_active_idx
  on public.admin_account_overrides (profile_id, active)
  where active = true;

revoke all on public.admin_account_overrides from authenticated, anon;
grant all on public.admin_account_overrides to service_role;
alter table public.admin_account_overrides enable row level security;

-- Provider-independent pricing (separate from ai_plan_minute_configs).
create table if not exists public.pricing_plans (
  plan_id text primary key
    check (plan_id in ('free', 'pro', 'max', 'ultra', 'enterprise')),
  display_name text not null,
  base_monthly_price_usd numeric(18, 4) not null default 0,
  included_minutes numeric(18, 4) not null,
  minimum_minutes numeric(18, 4),
  maximum_minutes numeric(18, 4),
  minutes_step numeric(18, 4) not null default 1,
  price_increment_usd numeric(18, 4) not null default 0,
  pricing_mode text not null default 'fixed'
    check (pricing_mode in ('fixed', 'adjustable')),
  is_public boolean not null default true,
  is_self_serve boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

drop trigger if exists pricing_plans_updated_at on public.pricing_plans;
create trigger pricing_plans_updated_at
  before update on public.pricing_plans
  for each row execute function public.set_updated_at();

insert into public.pricing_plans (
  plan_id,
  display_name,
  base_monthly_price_usd,
  included_minutes,
  minimum_minutes,
  maximum_minutes,
  minutes_step,
  price_increment_usd,
  pricing_mode,
  is_public,
  is_self_serve,
  active,
  sort_order
) values
  ('free', 'Free', 0, 10, 10, 10, 1, 0, 'fixed', true, true, true, 10),
  ('pro', 'Pro', 20, 50, 10, 50, 1, 0, 'adjustable', true, true, true, 20),
  ('max', 'Max', 50, 150, 50, 150, 1, 0, 'adjustable', true, true, true, 30),
  ('ultra', 'Ultra', 150, 500, 200, 500, 1, 0, 'adjustable', false, false, true, 40),
  ('enterprise', 'Enterprise', 0, 1000, 501, null, 1, 0, 'fixed', false, false, true, 50)
on conflict (plan_id) do update set
  display_name = excluded.display_name,
  base_monthly_price_usd = excluded.base_monthly_price_usd,
  included_minutes = excluded.included_minutes,
  minimum_minutes = excluded.minimum_minutes,
  maximum_minutes = excluded.maximum_minutes,
  minutes_step = excluded.minutes_step,
  price_increment_usd = excluded.price_increment_usd,
  pricing_mode = excluded.pricing_mode,
  is_public = excluded.is_public,
  is_self_serve = excluded.is_self_serve,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

revoke all on public.pricing_plans from authenticated, anon;
grant all on public.pricing_plans to service_role;
alter table public.pricing_plans enable row level security;
