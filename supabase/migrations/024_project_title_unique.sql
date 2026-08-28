-- Enforce unique project titles within a workspace (case-insensitive).
create unique index if not exists projects_workspace_title_unique
  on public.projects (workspace_id, lower(btrim(title)));
