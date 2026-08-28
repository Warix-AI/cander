-- Invited users skip onboarding — profile is pre-filled from the invite.

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
    name = v_name,
    short_name = coalesce(nullif(v_short, ''), 'Member'),
    plan = v_invite.plan,
    role = 'Member',
    subscription_status = 'active',
    onboarding_completed_at = coalesce(onboarding_completed_at, now())
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
