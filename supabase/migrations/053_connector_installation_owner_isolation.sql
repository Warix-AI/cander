-- Connector installations are personal until explicit workspace sharing exists.
-- Workspace membership alone must not expose another member's connector rows.

drop policy if exists "connector_installations_select" on public.connector_installations;

create policy "connector_installations_select_own"
  on public.connector_installations for select
  to authenticated
  using (profile_id = auth.uid());

comment on table public.connector_installations is
  'Personal connector installation metadata. Workspace sharing requires an explicit future policy.';
