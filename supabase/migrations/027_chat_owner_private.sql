-- Owner-private UI chats within a workspace.
-- Co-members see projects/sources; they do NOT see each other's threads/messages.
-- Private AI tables (ai_chats*) already owner-only — unchanged.

-- Backfill missing creators so RLS can attach rows to someone.
update public.threads
set created_by = (
  select wm.profile_id
  from public.workspace_members wm
  where wm.workspace_id = threads.workspace_id
  order by wm.created_at asc nulls last
  limit 1
)
where created_by is null;

create index if not exists threads_created_by_idx
  on public.threads (created_by, updated_at desc);

-- Drop workspace-wide chat policies
drop policy if exists "threads_select_member" on public.threads;
drop policy if exists "threads_insert_member" on public.threads;
drop policy if exists "threads_update_member" on public.threads;
drop policy if exists "threads_delete_member" on public.threads;
drop policy if exists "messages_select_member" on public.messages;
drop policy if exists "messages_insert_member" on public.messages;
drop policy if exists "messages_update_member" on public.messages;
drop policy if exists "messages_delete_member" on public.messages;

-- Threads: owner only, must still be a workspace member
create policy "threads_select_owner"
  on public.threads for select
  using (
    created_by = auth.uid()
    and workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

create policy "threads_insert_owner"
  on public.threads for insert
  with check (
    created_by = auth.uid()
    and workspace_id in (
      select wm.workspace_id
      from public.workspace_members wm
      where wm.profile_id = auth.uid()
    )
  );

create policy "threads_update_owner"
  on public.threads for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "threads_delete_owner"
  on public.threads for delete
  using (created_by = auth.uid());

-- Messages: only via threads the user owns
create policy "messages_select_owner"
  on public.messages for select
  using (
    exists (
      select 1 from public.threads t
      where t.id = messages.thread_id
        and t.created_by = auth.uid()
    )
  );

create policy "messages_insert_owner"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.threads t
      where t.id = messages.thread_id
        and t.created_by = auth.uid()
    )
  );

create policy "messages_update_owner"
  on public.messages for update
  using (
    exists (
      select 1 from public.threads t
      where t.id = messages.thread_id
        and t.created_by = auth.uid()
    )
  );

create policy "messages_delete_owner"
  on public.messages for delete
  using (
    exists (
      select 1 from public.threads t
      where t.id = messages.thread_id
        and t.created_by = auth.uid()
    )
  );
