-- Retire Ultra plan: map existing rows to Max and tighten plan check.

update public.profiles set plan = 'max' where plan = 'ultra';

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'pro', 'max'));

alter table public.org_members drop constraint if exists org_members_plan_check;
alter table public.org_members
  add constraint org_members_plan_check
  check (plan in ('free', 'pro', 'max'));

update public.org_members set plan = 'max' where plan = 'ultra';
