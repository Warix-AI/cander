-- Workspace invites (user consent) + org admin auto-add on member workspaces

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces (id) on delete cascade,
  invitee_profile_id uuid references public.profiles (id) on delete cascade,
  invitee_email text not null,
  invited_by uuid not null references public.profiles (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_invites_invitee_profile_idx
  on public.workspace_invites (invitee_profile_id)
  where status = 'pending';

create index if not exists workspace_invites_invitee_email_idx
  on public.workspace_invites (lower(invitee_email))
  where status = 'pending';

create index if not exists workspace_invites_workspace_idx
  on public.workspace_invites (workspace_id, status);

alter table public.workspace_invites enable row level security;

-- Invitee can read/respond to their invites
drop policy if exists "workspace_invites_invitee_select" on public.workspace_invites;
create policy "workspace_invites_invitee_select"
  on public.workspace_invites for select
  using (
    invitee_profile_id = auth.uid()
    or lower(invitee_email) = lower(coalesce((select email from public.profiles where id = auth.uid()), ''))
    or invited_by = auth.uid()
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_invites.workspace_id
        and wm.profile_id = auth.uid()
        and wm.role in ('Owner', 'Admin')
    )
    or exists (
      select 1 from public.org_members om
      join public.org_members actor on actor.org_id = om.org_id
      where om.org_id = workspace_invites.org_id
        and actor.profile_id = auth.uid()
        and actor.role in ('Owner', 'Admin')
        and om.seat_status = 'active'
    )
  );

drop policy if exists "workspace_invites_invitee_update" on public.workspace_invites;
create policy "workspace_invites_invitee_update"
  on public.workspace_invites for update
  using (
    invitee_profile_id = auth.uid()
    or lower(invitee_email) = lower(coalesce((select email from public.profiles where id = auth.uid()), ''))
  )
  with check (
    invitee_profile_id = auth.uid()
    or lower(invitee_email) = lower(coalesce((select email from public.profiles where id = auth.uid()), ''))
  );

drop policy if exists "workspace_invites_manager_insert" on public.workspace_invites;
create policy "workspace_invites_manager_insert"
  on public.workspace_invites for insert
  with check (
    invited_by = auth.uid()
    and (
      exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = workspace_invites.workspace_id
          and wm.profile_id = auth.uid()
          and wm.role in ('Owner', 'Admin')
      )
      or exists (
        select 1 from public.org_members om
        where om.org_id = workspace_invites.org_id
          and om.profile_id = auth.uid()
          and om.role in ('Owner', 'Admin')
          and om.seat_status = 'active'
      )
    )
  );

drop trigger if exists workspace_invites_updated_at on public.workspace_invites;
create trigger workspace_invites_updated_at
  before update on public.workspace_invites
  for each row execute function public.set_updated_at();

-- Auto-add org Owner/Admin when a managed org member joins or creates a workspace
create or replace function public.sync_org_admins_to_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
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

  select w.spaces into v_spaces
  from public.workspaces w
  where w.id = NEW.workspace_id;

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

drop trigger if exists workspace_members_sync_org_admins on public.workspace_members;
create trigger workspace_members_sync_org_admins
  after insert on public.workspace_members
  for each row execute function public.sync_org_admins_to_workspace();
