-- AI minute plan configuration (admin-editable) + support Ultra/Enterprise plan ids.
-- Period snapshots on account_usage_periods remain authoritative for in-flight periods.

-- Allow ultra + enterprise on profiles / org_members (in addition to free/pro/max).
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'pro', 'max', 'ultra', 'enterprise'));

alter table public.org_members drop constraint if exists org_members_plan_check;
alter table public.org_members
  add constraint org_members_plan_check
  check (plan in ('free', 'pro', 'max', 'ultra', 'enterprise'));

-- Optional per-account AI minutes override (Enterprise / custom contracts).
alter table public.profiles
  add column if not exists ai_minutes_override numeric(18, 4);

alter table public.profiles
  add column if not exists ai_minutes_plan text
    check (
      ai_minutes_plan is null
      or ai_minutes_plan in ('free', 'pro', 'max', 'ultra', 'enterprise')
    );

-- Admin-editable plan minute configuration (source of truth for defaults/ranges).
create table if not exists public.ai_plan_minute_configs (
  plan_id text primary key
    check (plan_id in ('free', 'pro', 'max', 'ultra', 'enterprise')),
  label text not null,
  included_minutes numeric(18, 4) not null,
  minimum_minutes numeric(18, 4),
  maximum_minutes numeric(18, 4),
  minutes_step numeric(18, 4) not null default 1,
  internal_budget_usd numeric(18, 4) not null default 0,
  usage_limit_behavior text not null default 'hard'
    check (usage_limit_behavior in ('soft', 'hard')),
  is_enterprise boolean not null default false,
  is_self_serve boolean not null default true,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

drop trigger if exists ai_plan_minute_configs_updated_at on public.ai_plan_minute_configs;
create trigger ai_plan_minute_configs_updated_at
  before update on public.ai_plan_minute_configs
  for each row execute function public.set_updated_at();

insert into public.ai_plan_minute_configs (
  plan_id,
  label,
  included_minutes,
  minimum_minutes,
  maximum_minutes,
  minutes_step,
  internal_budget_usd,
  usage_limit_behavior,
  is_enterprise,
  is_self_serve
) values
  ('free', 'Free', 10, 10, 10, 1, 1, 'hard', false, true),
  ('pro', 'Pro', 50, 10, 50, 1, 15, 'hard', false, true),
  ('max', 'Max', 150, 50, 150, 1, 40, 'hard', false, true),
  ('ultra', 'Ultra', 500, 200, 500, 1, 120, 'hard', false, true),
  ('enterprise', 'Enterprise', 1000, 501, null, 1, 250, 'hard', true, false)
on conflict (plan_id) do update set
  label = excluded.label,
  included_minutes = excluded.included_minutes,
  minimum_minutes = excluded.minimum_minutes,
  maximum_minutes = excluded.maximum_minutes,
  minutes_step = excluded.minutes_step,
  internal_budget_usd = excluded.internal_budget_usd,
  usage_limit_behavior = excluded.usage_limit_behavior,
  is_enterprise = excluded.is_enterprise,
  is_self_serve = excluded.is_self_serve,
  updated_at = now();

revoke all on public.ai_plan_minute_configs from authenticated, anon;
grant all on public.ai_plan_minute_configs to service_role;
alter table public.ai_plan_minute_configs enable row level security;

-- Extend AI usage source taxonomy for expert + speculation (text already extensible).
-- No schema change required; documented in app types.

-- Abandoned running events cleanup helper (service-role).
create or replace function public.close_orphaned_ai_usage_events(
  p_older_than_minutes integer default 180
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  closed integer;
begin
  with updated as (
    update public.ai_usage_events
    set
      status = 'interrupted',
      ended_at = coalesce(ended_at, now()),
      active_duration_ms = greatest(
        0,
        floor(
          extract(
            epoch from (coalesce(ended_at, now()) - started_at)
          ) * 1000
        )::bigint
      ),
      active_minutes = greatest(
        0,
        extract(epoch from (coalesce(ended_at, now()) - started_at)) / 60.0
      ),
      metadata = metadata || jsonb_build_object('orphanClosed', true),
      updated_at = now()
    where status = 'running'
      and started_at < now() - make_interval(mins => greatest(p_older_than_minutes, 5))
    returning 1
  )
  select count(*)::integer into closed from updated;
  return coalesce(closed, 0);
end;
$$;

revoke all on function public.close_orphaned_ai_usage_events(integer) from public;
grant execute on function public.close_orphaned_ai_usage_events(integer) to service_role;
