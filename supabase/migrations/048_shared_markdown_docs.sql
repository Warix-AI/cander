-- Public shareable markdown documents (project browser tabs).
-- Public URL shape: https://{id}.cander.app  (rewritten to /d/{id})

create table if not exists public.shared_markdown_docs (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'Document',
  markdown text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_markdown_docs_project_idx
  on public.shared_markdown_docs (workspace_id, project_id, updated_at desc);

create index if not exists shared_markdown_docs_created_by_idx
  on public.shared_markdown_docs (created_by, created_at desc);

drop trigger if exists shared_markdown_docs_updated_at
  on public.shared_markdown_docs;
create trigger shared_markdown_docs_updated_at
  before update on public.shared_markdown_docs
  for each row execute function public.set_updated_at();

alter table public.shared_markdown_docs enable row level security;

-- Anyone can read a shared doc by id (public share links).
drop policy if exists "shared_markdown_docs_public_select" on public.shared_markdown_docs;
create policy "shared_markdown_docs_public_select"
  on public.shared_markdown_docs for select
  using (true);

drop policy if exists "shared_markdown_docs_member_insert" on public.shared_markdown_docs;
create policy "shared_markdown_docs_member_insert"
  on public.shared_markdown_docs for insert
  with check (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "shared_markdown_docs_member_update" on public.shared_markdown_docs;
create policy "shared_markdown_docs_member_update"
  on public.shared_markdown_docs for update
  using (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  )
  with check (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "shared_markdown_docs_member_delete" on public.shared_markdown_docs;
create policy "shared_markdown_docs_member_delete"
  on public.shared_markdown_docs for delete
  using (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

grant select on public.shared_markdown_docs to anon, authenticated;
grant insert, update, delete on public.shared_markdown_docs to authenticated;
grant all on public.shared_markdown_docs to service_role;
