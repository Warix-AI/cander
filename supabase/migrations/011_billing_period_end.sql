-- Subscription period end + cancel-at-period-end flags
-- Run after 010_billing.sql

alter table public.profiles
  add column if not exists subscription_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

alter table public.organizations
  add column if not exists subscription_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;
