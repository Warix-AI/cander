-- Purchased AI minutes + monthly price (minutes-first billing).
-- Plan classification on profiles.plan is derived from purchased minutes.

alter table public.profiles
  add column if not exists purchased_ai_minutes numeric(18, 4);

alter table public.profiles
  add column if not exists subscription_monthly_price_usd numeric(18, 4);

comment on column public.profiles.purchased_ai_minutes is
  'Monthly AI minutes the customer purchased (source of usage allowance).';

comment on column public.profiles.subscription_monthly_price_usd is
  'Monthly USD charged for purchased_ai_minutes (authoritative at subscribe time).';
