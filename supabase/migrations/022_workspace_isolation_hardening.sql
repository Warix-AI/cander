-- Tighten membership writes and let workspace co-members read each other's public profile names.
-- Do not subquery workspace_members from its own RLS (42P17); use definer helpers.

create or replace function public.is_workspace_admin(ws_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = ws_id
      and profile_id = auth.uid()
      and role in ('Owner', 'Admin')
  );
$$;

create or replace function public.workspace_has_members(ws_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = ws_id
  );
$$;

revoke all on function public.is_workspace_admin(text) from public;
revoke all on function public.workspace_has_members(text) from public;
grant execute on function public.is_workspace_admin(text) to authenticated, service_role;
grant execute on function public.workspace_has_members(text) to authenticated, service_role;

-- Anyone could previously insert themselves into any workspace (profile_id = auth.uid()),
-- or insert arbitrary members if they already belonged. First member of a new workspace
-- is still allowed; later joins go through invites (service role) or Owner/Admin.
drop policy if exists "workspace_members_insert" on public.workspace_members;
create policy "workspace_members_insert"
  on public.workspace_members for insert
  with check (
    public.is_workspace_admin(workspace_id)
    or (
      profile_id = auth.uid()
      and not public.workspace_has_members(workspace_id)
    )
  );

-- Members may update their own row (spaces), but not promote themselves.
create or replace function public.workspace_members_guard_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    raise exception 'Workspace role changes are not allowed from the client';
  end if;
  return new;
end;
$$;

drop trigger if exists workspace_members_guard_role on public.workspace_members;
create trigger workspace_members_guard_role
  before update on public.workspace_members
  for each row execute function public.workspace_members_guard_role();

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_comember" on public.profiles;
create policy "profiles_select_comember"
  on public.profiles for select
  using (
    id = auth.uid()
    or id in (
      select wm.profile_id
      from public.workspace_members wm
      where wm.workspace_id in (select public.user_workspace_ids())
    )
  );
