-- Fix profiles UPDATE RLS recursion (42P17).
-- profiles_update_own WITH CHECK selected from public.profiles, which re-enters
-- the same policy chain and fails avatar_url updates.

create or replace function public.profiles_managed_fields_unchanged(
  p_id uuid,
  p_name text,
  p_email text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_id
      and p.name is not distinct from p_name
      and p.email is not distinct from p_email
  );
$$;

revoke all on function public.profiles_managed_fields_unchanged(uuid, text, text) from public;
grant execute on function public.profiles_managed_fields_unchanged(uuid, text, text)
  to authenticated, service_role;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and (
      not public.is_managed_org_member(auth.uid())
      or public.profiles_managed_fields_unchanged(auth.uid(), name, email)
    )
  );
