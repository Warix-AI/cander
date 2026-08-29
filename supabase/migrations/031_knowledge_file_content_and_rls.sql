-- Persist extractable KB file text for retrieval, and align RLS with product:
-- any workspace member may READ knowledge; only Owner/Admin may WRITE.
-- Intentional residual: connector disable toggles remain Admin-only via
-- workspace_policies write policy (023); Members never manage connectors/KBs in UI.

alter table public.knowledge_files
  add column if not exists content_text text not null default '';

drop policy if exists "knowledge_bases_member" on public.knowledge_bases;
drop policy if exists "knowledge_files_member" on public.knowledge_files;

create policy "knowledge_bases_select_member"
  on public.knowledge_bases for select
  using (public.is_workspace_member(workspace_id));

create policy "knowledge_bases_write_admin"
  on public.knowledge_bases for all
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy "knowledge_files_select_member"
  on public.knowledge_files for select
  using (public.is_workspace_member(workspace_id));

create policy "knowledge_files_write_admin"
  on public.knowledge_files for all
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));
