-- One-shot fix for Cander Supabase privileges + workspace_members recursion.
-- Paste into: Supabase Dashboard → SQL → New query → Run
-- Project: xwlmeevrwczclladnlfv

grant usage on schema public to postgres, anon, authenticated, service_role;

grant all on all tables in schema public to postgres, service_role;
grant all on all sequences in schema public to postgres, service_role;
grant all on all routines in schema public to postgres, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all routines in schema public to authenticated;

grant select on all tables in schema public to anon;
grant execute on all routines in schema public to anon;

alter default privileges in schema public
  grant all on tables to postgres, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

create or replace function public.user_workspace_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id
  from public.workspace_members
  where profile_id = auth.uid();
$$;

revoke all on function public.user_workspace_ids() from public;
grant execute on function public.user_workspace_ids() to authenticated, service_role;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "workspace_members_select" on public.workspace_members;
create policy "workspace_members_select"
  on public.workspace_members for select
  using (
    profile_id = auth.uid()
    or workspace_id in (select public.user_workspace_ids())
  );

drop policy if exists "workspace_members_insert" on public.workspace_members;
create policy "workspace_members_insert"
  on public.workspace_members for insert
  with check (
    profile_id = auth.uid()
    or workspace_id in (select public.user_workspace_ids())
  );

drop policy if exists "workspace_members_update" on public.workspace_members;
create policy "workspace_members_update"
  on public.workspace_members for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
