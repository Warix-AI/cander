-- Fixed catalog plans: free/pro/max/ultra/enterprise → minimal/light/moderate/heavy/limitless.
-- Updates existing plan columns, CHECK constraints, and minute/pricing config seeds.

-- ── profiles.plan ─────────────────────────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_plan_check;

update public.profiles set plan = 'minimal' where plan = 'free';
update public.profiles set plan = 'light' where plan = 'pro';
update public.profiles set plan = 'moderate' where plan = 'max';
update public.profiles set plan = 'heavy' where plan = 'ultra';
update public.profiles set plan = 'limitless' where plan = 'enterprise';

alter table public.profiles
  alter column plan set default 'minimal';

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('minimal', 'light', 'moderate', 'heavy', 'limitless'));

-- ── profiles.ai_minutes_plan ──────────────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_ai_minutes_plan_check;

update public.profiles set ai_minutes_plan = 'minimal' where ai_minutes_plan = 'free';
update public.profiles set ai_minutes_plan = 'light' where ai_minutes_plan = 'pro';
update public.profiles set ai_minutes_plan = 'moderate' where ai_minutes_plan = 'max';
update public.profiles set ai_minutes_plan = 'heavy' where ai_minutes_plan = 'ultra';
update public.profiles set ai_minutes_plan = 'limitless' where ai_minutes_plan = 'enterprise';

alter table public.profiles
  add constraint profiles_ai_minutes_plan_check
  check (
    ai_minutes_plan is null
    or ai_minutes_plan in ('minimal', 'light', 'moderate', 'heavy', 'limitless')
  );

-- ── org_members.plan ──────────────────────────────────────────────────────────
alter table public.org_members drop constraint if exists org_members_plan_check;

update public.org_members set plan = 'minimal' where plan = 'free';
update public.org_members set plan = 'light' where plan = 'pro';
update public.org_members set plan = 'moderate' where plan = 'max';
update public.org_members set plan = 'heavy' where plan = 'ultra';
update public.org_members set plan = 'limitless' where plan = 'enterprise';

alter table public.org_members
  add constraint org_members_plan_check
  check (plan in ('minimal', 'light', 'moderate', 'heavy', 'limitless'));

-- ── org_invites.plan (pro/max → light/moderate) ───────────────────────────────
alter table public.org_invites drop constraint if exists org_invites_plan_check;

update public.org_invites set plan = 'light' where plan = 'pro';
update public.org_invites set plan = 'moderate' where plan = 'max';

alter table public.org_invites
  alter column plan set default 'light';

alter table public.org_invites
  add constraint org_invites_plan_check
  check (plan in ('light', 'moderate'));

-- ── account_usage_periods.plan (no CHECK historically; normalize values) ──────
update public.account_usage_periods set plan = 'minimal' where plan = 'free';
update public.account_usage_periods set plan = 'light' where plan = 'pro';
update public.account_usage_periods set plan = 'moderate' where plan = 'max';
update public.account_usage_periods set plan = 'heavy' where plan = 'ultra';
update public.account_usage_periods set plan = 'limitless' where plan = 'enterprise';

-- ── ai_plan_minute_configs ────────────────────────────────────────────────────
alter table public.ai_plan_minute_configs drop constraint if exists ai_plan_minute_configs_plan_id_check;

update public.ai_plan_minute_configs set plan_id = 'minimal' where plan_id = 'free';
update public.ai_plan_minute_configs set plan_id = 'light' where plan_id = 'pro';
update public.ai_plan_minute_configs set plan_id = 'moderate' where plan_id = 'max';
update public.ai_plan_minute_configs set plan_id = 'heavy' where plan_id = 'ultra';
update public.ai_plan_minute_configs set plan_id = 'limitless' where plan_id = 'enterprise';

alter table public.ai_plan_minute_configs
  add constraint ai_plan_minute_configs_plan_id_check
  check (plan_id in ('minimal', 'light', 'moderate', 'heavy', 'limitless'));

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
  ('minimal', 'Minimal', 25, 25, 25, 1, 1, 'hard', false, true),
  ('light', 'Light', 100, 100, 100, 1, 22, 'hard', false, true),
  ('moderate', 'Moderate', 250, 250, 250, 1, 55, 'hard', false, true),
  ('heavy', 'Heavy', 500, 500, 500, 1, 110, 'hard', false, true),
  ('limitless', 'Limitless', 1000, 501, null, 1, 250, 'hard', true, false)
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

-- ── pricing_plans ─────────────────────────────────────────────────────────────
alter table public.pricing_plans drop constraint if exists pricing_plans_plan_id_check;

update public.pricing_plans set plan_id = 'minimal' where plan_id = 'free';
update public.pricing_plans set plan_id = 'light' where plan_id = 'pro';
update public.pricing_plans set plan_id = 'moderate' where plan_id = 'max';
update public.pricing_plans set plan_id = 'heavy' where plan_id = 'ultra';
update public.pricing_plans set plan_id = 'limitless' where plan_id = 'enterprise';

alter table public.pricing_plans
  add constraint pricing_plans_plan_id_check
  check (plan_id in ('minimal', 'light', 'moderate', 'heavy', 'limitless'));

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
  ('minimal', 'Minimal', 0, 25, 25, 25, 1, 0, 'fixed', true, true, true, 10),
  ('light', 'Light', 30, 100, 100, 100, 1, 0, 'fixed', true, true, true, 20),
  ('moderate', 'Moderate', 75, 250, 250, 250, 1, 0, 'fixed', true, true, true, 30),
  ('heavy', 'Heavy', 150, 500, 500, 500, 1, 0, 'fixed', true, true, true, 40),
  ('limitless', 'Limitless', 0, 1000, 501, null, 1, 0, 'fixed', false, false, true, 50)
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
