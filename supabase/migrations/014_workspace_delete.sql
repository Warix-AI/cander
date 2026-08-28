-- Allow workspace owners to delete their workspaces (cascade removes members).
drop policy if exists "workspaces_delete_owner" on public.workspaces;
create policy "workspaces_delete_owner"
  on public.workspaces for delete
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.profile_id = auth.uid()
        and wm.role = 'Owner'
    )
  );
