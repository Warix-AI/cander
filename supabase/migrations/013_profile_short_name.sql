-- Preferred short name for greetings (onboarding profile step).
alter table public.profiles
  add column if not exists short_name text not null default '';
