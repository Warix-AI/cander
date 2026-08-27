-- Billing + org invite tokens
-- Run after 009_org_onboarding.sql

-- ── Profile billing ───────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text not null default 'none'
    check (subscription_status in ('none', 'trialing', 'active', 'past_due', 'canceled')),
  add column if not exists onboarding_checkpoint jsonb;

-- ── Organization billing ──────────────────────────────────────────────────────
alter table public.organizations
  add column if not exists stripe_subscription_id text,
  add column if not exists billing_owner_id uuid references public.profiles (id) on delete set null;

-- ── Org member seat billing ───────────────────────────────────────────────────
alter table public.org_members
  add column if not exists stripe_seat_billed_at timestamptz;

-- ── Invite tokens (email → pre-filled accept flow) ────────────────────────────
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

drop trigger if exists org_invites_updated_at on public.org_invites;
create trigger org_invites_updated_at
  before update on public.org_invites
  for each row execute function public.set_updated_at();

alter table public.org_invites enable row level security;

create policy "org_invites_select_admin"
  on public.org_invites for select
  using (
    invited_by = auth.uid()
    or exists (
      select 1
      from public.org_members om
      join public.workspace_members wm on wm.profile_id = auth.uid()
      where om.org_id = org_invites.org_id
        and om.role in ('Owner', 'Admin')
        and wm.workspace_id = any (om.workspace_ids)
    )
  );

create or replace function public.get_org_invite_by_token(p_token text)
returns table (
  invite_id uuid,
  org_id uuid,
  org_name text,
  email text,
  first_name text,
  last_name text,
  plan text,
  status text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id,
    i.org_id,
    o.name,
    i.email,
    i.first_name,
    i.last_name,
    i.plan,
    i.status,
    i.expires_at
  from public.org_invites i
  join public.organizations o on o.id = i.org_id
  where i.token = p_token
    and i.status = 'pending'
    and i.expires_at > now();
$$;

revoke all on function public.get_org_invite_by_token(text) from public;
grant execute on function public.get_org_invite_by_token(text) to anon, authenticated;

create or replace function public.accept_org_invite(
  p_token text,
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.org_invites%rowtype;
  v_name text;
  v_short text;
  v_initials text;
  v_ws text;
begin
  select * into v_invite
  from public.org_invites
  where token = p_token
    and status = 'pending'
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Invite not found or expired';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id
      and lower(p.email) = lower(v_invite.email)
  ) then
    raise exception 'Email does not match invite';
  end if;

  v_name := trim(concat_ws(' ', v_invite.first_name, v_invite.last_name));
  if v_name = '' then
    v_name := split_part(v_invite.email, '@', 1);
  end if;
  v_short := split_part(v_name, ' ', 1);
  v_initials := upper(left(v_name, 2));

  update public.org_invites
  set
    status = 'accepted',
    accepted_at = now(),
    accepted_profile_id = p_profile_id,
    updated_at = now()
  where id = v_invite.id;

  update public.org_members
  set
    profile_id = p_profile_id,
    email = v_invite.email,
    name = v_name,
    short_name = coalesce(nullif(v_short, ''), 'Member'),
    initials = coalesce(nullif(v_initials, ''), 'IN'),
    plan = v_invite.plan,
    seat_status = 'active',
    kind = 'org',
    workspace_ids = v_invite.workspace_ids,
    stripe_seat_billed_at = now(),
    updated_at = now()
  where id = coalesce(
    v_invite.org_member_id,
    'invite-' || regexp_replace(lower(v_invite.email), '[^a-z0-9]', '', 'gi')
  );

  update public.profiles
  set
    plan = v_invite.plan,
    role = 'Member',
    subscription_status = 'active'
  where id = p_profile_id;

  foreach v_ws in array v_invite.workspace_ids
  loop
    insert into public.workspace_members (workspace_id, profile_id, role, spaces)
    values (v_ws, p_profile_id, 'Member', array['work', 'build', 'research']::text[])
    on conflict (workspace_id, profile_id) do update
    set role = excluded.role;
  end loop;

  return v_invite.org_id;
end;
$$;

revoke all on function public.accept_org_invite(text, uuid) from public;
grant execute on function public.accept_org_invite(text, uuid) to authenticated;
