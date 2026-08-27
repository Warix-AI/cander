-- Org onboarding: create organization, link workspace, persist pending invites
-- Run after 008_plans_three_tier.sql

create or replace function public.setup_org_onboarding(
  p_org_name text,
  p_workspace_id text,
  p_invites jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_profile record;
  invite jsonb;
  v_email text;
  v_name text;
  v_plan text;
  v_invite_id text;
  v_short text;
  v_initials text;
  v_owner_initials text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if trim(coalesce(p_org_name, '')) = '' then
    raise exception 'Organization name required';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.profile_id = v_uid
      and wm.role = 'Owner'
  ) then
    raise exception 'Not workspace owner';
  end if;

  select name, email, plan
  into v_profile
  from public.profiles
  where id = v_uid;

  insert into public.organizations (name)
  values (trim(p_org_name))
  returning id into v_org_id;

  update public.workspaces
  set
    org_id = v_org_id,
    kind = 'business',
    personal = false,
    name = trim(p_org_name)
  where id = p_workspace_id;

  v_owner_initials := upper(left(coalesce(v_profile.name, 'Owner'), 2));

  insert into public.org_members (
    id,
    org_id,
    profile_id,
    email,
    name,
    short_name,
    initials,
    role,
    plan,
    seat_status,
    kind,
    workspace_ids
  )
  values (
    v_uid::text,
    v_org_id,
    v_uid,
    coalesce(v_profile.email, ''),
    coalesce(v_profile.name, 'Owner'),
    split_part(coalesce(v_profile.name, 'Owner'), ' ', 1),
    coalesce(nullif(v_owner_initials, ''), 'OW'),
    'Owner',
    coalesce(v_profile.plan, 'max'),
    'active',
    'org',
    array[p_workspace_id]
  )
  on conflict (id) do update
  set
    org_id = excluded.org_id,
    profile_id = excluded.profile_id,
    email = excluded.email,
    name = excluded.name,
    short_name = excluded.short_name,
    initials = excluded.initials,
    role = excluded.role,
    plan = excluded.plan,
    seat_status = excluded.seat_status,
    kind = excluded.kind,
    workspace_ids = excluded.workspace_ids,
    updated_at = now();

  for invite in
    select value
    from jsonb_array_elements(coalesce(p_invites, '[]'::jsonb))
  loop
    v_email := lower(trim(invite->>'email'));
    if v_email is null or v_email not like '%@%' then
      continue;
    end if;

    v_name := trim(coalesce(invite->>'name', ''));
    if v_name = '' then
      v_name := initcap(replace(split_part(v_email, '@', 1), '.', ' '));
    end if;

    v_plan := coalesce(invite->>'plan', 'pro');
    if v_plan not in ('pro', 'max') then
      v_plan := 'pro';
    end if;

    v_invite_id := 'invite-' || regexp_replace(v_email, '[^a-z0-9]', '', 'gi');
    v_short := split_part(v_name, ' ', 1);
    v_initials := upper(left(v_name, 2));

    insert into public.org_members (
      id,
      org_id,
      profile_id,
      email,
      name,
      short_name,
      initials,
      role,
      plan,
      seat_status,
      kind,
      workspace_ids
    )
    values (
      v_invite_id,
      v_org_id,
      null,
      v_email,
      v_name,
      coalesce(nullif(v_short, ''), 'Member'),
      coalesce(nullif(v_initials, ''), 'IN'),
      'Member',
      v_plan,
      'pending',
      'org',
      array[p_workspace_id]
    )
    on conflict (id) do update
    set
      org_id = excluded.org_id,
      email = excluded.email,
      name = excluded.name,
      short_name = excluded.short_name,
      initials = excluded.initials,
      plan = excluded.plan,
      seat_status = excluded.seat_status,
      workspace_ids = excluded.workspace_ids,
      updated_at = now();
  end loop;

  return v_org_id;
end;
$$;

revoke all on function public.setup_org_onboarding(text, text, jsonb) from public;
grant execute on function public.setup_org_onboarding(text, text, jsonb) to authenticated;
