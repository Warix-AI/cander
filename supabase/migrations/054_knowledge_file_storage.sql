-- Persist workspace knowledge uploads in private Supabase Storage.
-- Workspace members may add files; retrieval still uses the extracted
-- content_text column so the AI can search them without exposing a public URL.

alter table public.knowledge_files
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists byte_size bigint not null default 0;

create index if not exists knowledge_files_workspace_idx
  on public.knowledge_files (workspace_id, knowledge_base_id, created_at desc);

create unique index if not exists knowledge_bases_one_per_workspace_uidx
  on public.knowledge_bases (workspace_id);

drop policy if exists "knowledge_bases_write_admin" on public.knowledge_bases;
drop policy if exists "knowledge_files_write_admin" on public.knowledge_files;

create policy "knowledge_bases_member_write"
  on public.knowledge_bases for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "knowledge_files_member_write"
  on public.knowledge_files for all
  using (public.is_workspace_member(workspace_id))
  with check (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1
      from public.knowledge_bases kb
      where kb.id = knowledge_files.knowledge_base_id
        and kb.workspace_id = knowledge_files.workspace_id
    )
  );

grant select, insert, update, delete on public.knowledge_bases to authenticated;
grant select, insert, update, delete on public.knowledge_files to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('knowledge-files', 'knowledge-files', false, 26214400)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "knowledge_files_storage_select" on storage.objects;
create policy "knowledge_files_storage_select"
  on storage.objects for select
  using (
    bucket_id = 'knowledge-files'
    and public.is_workspace_member((storage.foldername(name))[1])
  );

drop policy if exists "knowledge_files_storage_insert" on storage.objects;
create policy "knowledge_files_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'knowledge-files'
    and public.is_workspace_member((storage.foldername(name))[1])
  );

drop policy if exists "knowledge_files_storage_update" on storage.objects;
create policy "knowledge_files_storage_update"
  on storage.objects for update
  using (
    bucket_id = 'knowledge-files'
    and public.is_workspace_member((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'knowledge-files'
    and public.is_workspace_member((storage.foldername(name))[1])
  );

drop policy if exists "knowledge_files_storage_delete" on storage.objects;
create policy "knowledge_files_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'knowledge-files'
    and public.is_workspace_member((storage.foldername(name))[1])
  );
