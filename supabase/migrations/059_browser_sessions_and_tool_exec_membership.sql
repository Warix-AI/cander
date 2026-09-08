-- browser_sessions: own profile + membership on workspace_id
drop policy if exists "browser_sessions_own" on public.browser_sessions;

create policy "browser_sessions_own_member"
  on public.browser_sessions for all
  using (
    profile_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  )
  with check (
    profile_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

-- tool_executions: owner + membership
drop policy if exists "tool_executions_owner_insert" on public.tool_executions;
drop policy if exists "tool_executions_owner_update" on public.tool_executions;
drop policy if exists "tool_executions_owner_select" on public.tool_executions;

create policy "tool_executions_owner_select"
  on public.tool_executions for select
  using (
    owner_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

create policy "tool_executions_owner_insert"
  on public.tool_executions for insert
  with check (
    owner_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

create policy "tool_executions_owner_update"
  on public.tool_executions for update
  using (
    owner_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  )
  with check (
    owner_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );
