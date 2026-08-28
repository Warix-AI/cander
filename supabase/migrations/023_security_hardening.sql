-- Critical/High security hardening: lock billing columns, org membership writes,
-- invite accept binding, org-admin workspace sync scope, and workspace policies.

-- ── Profiles: clients may only update non-billing display fields ─────────────
-- service_role / table owner (SECURITY DEFINER) retain full UPDATE.
revoke update on table public.profiles from authenticated;
grant update (
  name,
  short_name,
  email,
  onboarding_checkpoint,
  updated_at
) on table public.profiles to authenticated;

-- Keep managed-member display freeze from 019 (name/email/plan/role).
-- plan/role are no longer updatable by authenticated, so the plan/role clauses
-- are defense in depth if grants are widened later.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and (
      not public.is_managed_org_member(auth.uid())
      or (
        name is not distinct from (select p.name from public.profiles p where p.id = auth.uid())
        and email is not distinct from (select p.email from public.profiles p where p.id = auth.uid())
      )
    )
  );

-- ── Org members: no client self-write / privilege escalation ─────────────────
drop policy if exists "org_members_write" on public.org_members;

-- Authenticated users retain SELECT via org_members_select; mutations go through
-- service_role APIs only (invites, role/plan routes).

-- ── Workspace policies: members read; Owner/Admin write ──────────────────────
drop policy if exists "workspace_policies_member" on public.workspace_policies;
create policy "workspace_policies_select"
  on public.workspace_policies for select
  using (public.is_workspace_member(workspace_id));
create policy "workspace_policies_admin_write"
  on public.workspace_policies for all
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- ── Workspace create: personal only, or org manager for org-linked ───────────
drop policy if exists "workspaces_insert_authenticated" on public.workspaces;
create policy "workspaces_insert_authenticated"
  on public.workspaces for insert
  with check (
    org_id is null
    or exists (
      select 1
      from public.org_members om
      where om.org_id = workspaces.org_id
        and om.profile_id = auth.uid()
        and om.seat_status = 'active'
        and om.role in ('Owner', 'Admin')
    )
  );

-- ── Workspace member insert: client may not mint Owner/Admin seats ───────────
drop policy if exists "workspace_members_insert" on public.workspace_members;
create policy "workspace_members_insert"
  on public.workspace_members for insert
  with check (
    (
      public.is_workspace_admin(workspace_id)
      and role = 'Member'
    )
    or (
      profile_id = auth.uid()
      and role = 'Owner'
      and not public.workspace_has_members(workspace_id)
    )
  );

-- ── Org-admin sync: only onto workspaces already owned by that org ───────────
create or replace function public.sync_org_admins_to_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_workspace_org uuid;
  v_spaces text[];
  admin record;
begin
  select om.org_id into v_org_id
  from public.org_members om
  where om.profile_id = NEW.profile_id
    and om.kind = 'org'
    and om.seat_status = 'active'
    and om.org_id is not null
  limit 1;

  if v_org_id is null then
    return NEW;
  end if;

  select w.org_id, w.spaces into v_workspace_org, v_spaces
  from public.workspaces w
  where w.id = NEW.workspace_id;

  -- Never inject org admins into personal / foreign workspaces.
  if v_workspace_org is distinct from v_org_id then
    return NEW;
  end if;

  for admin in
    select om.profile_id
    from public.org_members om
    where om.org_id = v_org_id
      and om.seat_status = 'active'
      and om.profile_id is not null
      and om.role in ('Owner', 'Admin')
      and om.profile_id <> NEW.profile_id
  loop
    insert into public.workspace_members (workspace_id, profile_id, role, spaces)
    values (
      NEW.workspace_id,
      admin.profile_id,
      'Admin',
      coalesce(v_spaces, array['work', 'build', 'research']::text[])
    )
    on conflict (workspace_id, profile_id) do nothing;
  end loop;

  return NEW;
end;
$$;

-- ── accept_org_invite: bind caller + org-owned workspaces only ───────────────
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
  if auth.uid() is distinct from p_profile_id then
    raise exception 'Invite must be accepted by the signed-in user';
  end if;

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
    workspace_ids = (
      select coalesce(array_agg(w.id), array[]::text[])
      from public.workspaces w
      where w.id = any (v_invite.workspace_ids)
        and w.org_id = v_invite.org_id
    ),
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
    if exists (
      select 1
      from public.workspaces w
      where w.id = v_ws
        and w.org_id = v_invite.org_id
    ) then
      insert into public.workspace_members (workspace_id, profile_id, role, spaces)
      values (v_ws, p_profile_id, 'Member', array['work', 'build', 'research']::text[])
      on conflict (workspace_id, profile_id) do update
      set spaces = excluded.spaces;
    end if;
  end loop;

  return v_invite.org_id;
end;
$$;

revoke all on function public.accept_org_invite(text, uuid) from public;
revoke all on function public.accept_org_invite(text, uuid) from anon;
grant execute on function public.accept_org_invite(text, uuid) to authenticated, service_role;

-- ── Workspace invite insert: require workspace admin (no org-wide IDOR) ───────
drop policy if exists "workspace_invites_manager_insert" on public.workspace_invites;
create policy "workspace_invites_manager_insert"
  on public.workspace_invites for insert
  with check (
    invited_by = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_invites.workspace_id
        and wm.profile_id = auth.uid()
        and wm.role in ('Owner', 'Admin')
    )
    and (
      org_id is null
      or exists (
        select 1
        from public.workspaces w
        where w.id = workspace_invites.workspace_id
          and w.org_id = workspace_invites.org_id
      )
    )
  );
