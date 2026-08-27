-- Ensure new users get full primary nav spaces (incl. connectors),
-- allow members to update their own membership row, and backfill.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_id text;
  display_name text;
begin
  display_name := coalesce(
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1),
    'User'
  );

  insert into public.profiles (id, email, name)
  values (new.id, coalesce(new.email, ''), display_name)
  on conflict (id) do nothing;

  ws_id := 'ws-' || replace(new.id::text, '-', '');

  insert into public.workspaces (id, name, kind, personal, spaces)
  values (
    ws_id,
    display_name || '''s workspace',
    'personal',
    true,
    array['work', 'build', 'research', 'connectors']::text[]
  )
  on conflict (id) do nothing;

  insert into public.workspace_members (workspace_id, profile_id, role, spaces)
  values (
    ws_id,
    new.id,
    'Owner',
    array['work', 'build', 'research', 'connectors']::text[]
  )
  on conflict do nothing;

  return new;
end;
$$;

-- Owners can update their own membership (spaces after onboarding)
drop policy if exists "workspace_members_update" on public.workspace_members;
create policy "workspace_members_update"
  on public.workspace_members for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Backfill: add connectors (and primary spaces) where missing
update public.workspace_members
set spaces = array(
  select distinct unnest(
    spaces || array['work', 'build', 'research', 'connectors']::text[]
  )
)
where not ('connectors' = any (spaces));

update public.workspaces
set spaces = array(
  select distinct unnest(
    spaces || array['work', 'build', 'research', 'connectors']::text[]
  )
)
where not ('connectors' = any (spaces));
