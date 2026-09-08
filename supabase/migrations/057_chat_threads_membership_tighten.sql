-- Tighten thread UPDATE/DELETE: owner + workspace membership on both
-- using and with check so workspace_id cannot be moved off a membership.

drop policy if exists "threads_update_owner" on public.threads;
drop policy if exists "threads_delete_owner" on public.threads;

create policy "threads_update_owner"
  on public.threads for update
  using (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  )
  with check (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

create policy "threads_delete_owner"
  on public.threads for delete
  using (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

-- Messages: also require membership on the owning thread's workspace.
drop policy if exists "messages_select_owner" on public.messages;
drop policy if exists "messages_insert_owner" on public.messages;
drop policy if exists "messages_update_owner" on public.messages;
drop policy if exists "messages_delete_owner" on public.messages;

create policy "messages_select_owner"
  on public.messages for select
  using (
    exists (
      select 1 from public.threads t
      where t.id = messages.thread_id
        and t.created_by = auth.uid()
        and public.is_workspace_member(t.workspace_id)
    )
  );

create policy "messages_insert_owner"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.threads t
      where t.id = messages.thread_id
        and t.created_by = auth.uid()
        and public.is_workspace_member(t.workspace_id)
    )
  );

create policy "messages_update_owner"
  on public.messages for update
  using (
    exists (
      select 1 from public.threads t
      where t.id = messages.thread_id
        and t.created_by = auth.uid()
        and public.is_workspace_member(t.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.threads t
      where t.id = messages.thread_id
        and t.created_by = auth.uid()
        and public.is_workspace_member(t.workspace_id)
    )
  );

create policy "messages_delete_owner"
  on public.messages for delete
  using (
    exists (
      select 1 from public.threads t
      where t.id = messages.thread_id
        and t.created_by = auth.uid()
        and public.is_workspace_member(t.workspace_id)
    )
  );
