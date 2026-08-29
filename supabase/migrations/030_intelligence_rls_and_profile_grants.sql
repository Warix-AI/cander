-- Tighten intelligence RLS: no shared null-workspace bucket.
-- Require membership for all reads/writes; scrub orphan null-workspace rows.

-- Drop permissive null-OR policies
drop policy if exists ai_tasks_select_member on public.ai_tasks;
drop policy if exists ai_tasks_insert_member on public.ai_tasks;
drop policy if exists ai_tasks_update_member on public.ai_tasks;

drop policy if exists project_revisions_select on public.project_revisions;
drop policy if exists project_revisions_insert on public.project_revisions;

drop policy if exists project_change_sets_select on public.project_change_sets;
drop policy if exists project_change_sets_insert on public.project_change_sets;
drop policy if exists project_change_sets_update on public.project_change_sets;

drop policy if exists ai_routing_events_insert on public.ai_routing_events;
drop policy if exists ai_routing_events_select on public.ai_routing_events;

-- Remove cross-tenant null-workspace orphans (cannot be attributed safely)
delete from public.ai_routing_events where workspace_id is null;
delete from public.project_change_sets where workspace_id is null;
delete from public.project_revisions where workspace_id is null;
delete from public.ai_tasks where workspace_id is null;

-- ai_tasks
create policy ai_tasks_select_member on public.ai_tasks
  for select using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

create policy ai_tasks_insert_member on public.ai_tasks
  for insert with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

create policy ai_tasks_update_member on public.ai_tasks
  for update using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

-- project_revisions
create policy project_revisions_select on public.project_revisions
  for select using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

create policy project_revisions_insert on public.project_revisions
  for insert with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

-- project_change_sets
create policy project_change_sets_select on public.project_change_sets
  for select using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

create policy project_change_sets_insert on public.project_change_sets
  for insert with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

create policy project_change_sets_update on public.project_change_sets
  for update using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

-- ai_routing_events
create policy ai_routing_events_insert on public.ai_routing_events
  for insert with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

create policy ai_routing_events_select on public.ai_routing_events
  for select using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

-- Profiles: authenticated cannot SELECT Stripe billing identifiers (co-member over-read).
-- service_role / table owner retain full access for server APIs.
revoke select on table public.profiles from authenticated;
grant select (
  id,
  email,
  name,
  short_name,
  plan,
  role,
  onboarding_checkpoint,
  onboarding_completed_at,
  subscription_status,
  subscription_period_end,
  cancel_at_period_end,
  created_at,
  updated_at
) on table public.profiles to authenticated;
