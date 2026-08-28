-- Managed org members: only short_name self-service on profiles

create or replace function public.is_managed_org_member(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members om
    where om.profile_id = p_profile_id
      and om.kind = 'org'
      and om.seat_status = 'active'
      and om.role <> 'Owner'
  );
$$;

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
        and plan is not distinct from (select p.plan from public.profiles p where p.id = auth.uid())
        and role is not distinct from (select p.role from public.profiles p where p.id = auth.uid())
      )
    )
  );
