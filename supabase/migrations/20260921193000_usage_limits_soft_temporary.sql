-- Temporarily relax usage limits so all accounts can use AI usage.
-- App enforcement is also opt-in via USAGE_ENFORCEMENT_ENABLED=true.
-- Revert behavior by setting USAGE_ENFORCEMENT_ENABLED=true and restoring hard limits.

update public.ai_plan_minute_configs
set
  usage_limit_behavior = 'soft',
  maximum_minutes = null,
  updated_at = now()
where active is true;

-- Soften in-flight billing periods so hard stops do not fire mid-cycle.
update public.account_usage_periods
set
  usage_limit_behavior = 'soft',
  updated_at = now()
where status = 'open'
  and usage_limit_behavior is distinct from 'soft';
