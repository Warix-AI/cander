-- Enforce unique project titles within a workspace (case-insensitive).
alter table public.projects enable row level security;
create unique index if not exists projects_workspace_title_unique
  on public.projects (workspace_id, lower(btrim(title)));
