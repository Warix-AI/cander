-- Billing columns + invite tables (from 010 + 011).
-- Paste into Supabase SQL Editor → Run.
-- Safe to re-run (IF NOT EXISTS / OR REPLACE).

alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists onboarding_checkpoint jsonb,
  add column if not exists subscription_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean;

update public.profiles
set subscription_status = 'none'
where subscription_status is null;

alter table public.profiles
  alter column subscription_status set default 'none';

do $$
begin
  alter table public.profiles
    alter column subscription_status set not null;
exception when others then null;
end $$;

do $$
begin
  alter table public.profiles
    drop constraint if exists profiles_subscription_status_check;
  alter table public.profiles
    add constraint profiles_subscription_status_check
    check (subscription_status in ('none', 'trialing', 'active', 'past_due', 'canceled'));
exception when others then null;
end $$;

update public.profiles
set cancel_at_period_end = false
where cancel_at_period_end is null;

alter table public.profiles
  alter column cancel_at_period_end set default false;

do $$
begin
  alter table public.profiles
    alter column cancel_at_period_end set not null;
exception when others then null;
end $$;

alter table public.organizations
  add column if not exists stripe_subscription_id text,
  add column if not exists billing_owner_id uuid references public.profiles (id) on delete set null,
  add column if not exists subscription_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

alter table public.org_members
  add column if not exists stripe_seat_billed_at timestamptz;

create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  org_id uuid not null references public.organizations (id) on delete cascade,
  org_member_id text references public.org_members (id) on delete set null,
  invited_by uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  plan text not null default 'pro'
    check (plan in ('pro', 'max')),
  workspace_ids text[] not null default array[]::text[],
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_invites_token_idx on public.org_invites (token);
create index if not exists org_invites_email_idx on public.org_invites (lower(email));
create index if not exists org_invites_org_idx on public.org_invites (org_id);

alter table public.org_invites enable row level security;

grant select, insert, update, delete on public.org_invites to authenticated, service_role;
grant select on public.org_invites to anon;
