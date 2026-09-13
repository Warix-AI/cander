-- Refresh fixed-plan Active AI Minutes allocations and prices.
-- Minimal 20 / Light 30 / Moderate 100 / Heavy 250 / Limitless custom.

update public.ai_plan_minute_configs set
  included_minutes = 20,
  minimum_minutes = 20,
  maximum_minutes = 20,
  internal_budget_usd = 1,
  label = 'Minimal',
  updated_at = now()
where plan_id = 'minimal';

update public.ai_plan_minute_configs set
  included_minutes = 30,
  minimum_minutes = 30,
  maximum_minutes = 30,
  internal_budget_usd = 11,
  label = 'Light',
  updated_at = now()
where plan_id = 'light';

update public.ai_plan_minute_configs set
  included_minutes = 100,
  minimum_minutes = 100,
  maximum_minutes = 100,
  internal_budget_usd = 37,
  label = 'Moderate',
  updated_at = now()
where plan_id = 'moderate';

update public.ai_plan_minute_configs set
  included_minutes = 250,
  minimum_minutes = 250,
  maximum_minutes = 250,
  internal_budget_usd = 92,
  label = 'Heavy',
  updated_at = now()
where plan_id = 'heavy';

update public.ai_plan_minute_configs set
  included_minutes = 1000,
  minimum_minutes = 251,
  maximum_minutes = null,
  internal_budget_usd = 250,
  label = 'Limitless',
  updated_at = now()
where plan_id = 'limitless';

-- Optional marketing pricing table (if present from admin foundation).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'plan_pricing_configs'
  ) then
    update public.plan_pricing_configs set
      monthly_price_usd = 0,
      updated_at = now()
    where plan_id = 'minimal';
    update public.plan_pricing_configs set
      monthly_price_usd = 15,
      updated_at = now()
    where plan_id = 'light';
    update public.plan_pricing_configs set
      monthly_price_usd = 50,
      updated_at = now()
    where plan_id = 'moderate';
    update public.plan_pricing_configs set
      monthly_price_usd = 125,
      updated_at = now()
    where plan_id = 'heavy';
  end if;
exception when others then
  null;
end $$;
