-- Enforce unique project titles within a workspace (case-insensitive).
-- Deduplicate existing collisions first (keep earliest updated_at / id).

with ranked as (
  select
    id,
    workspace_id,
    title,
    row_number() over (
      partition by workspace_id, lower(btrim(title))
      order by updated_at asc, created_at asc, id asc
    ) as rn
  from public.projects
)
update public.projects p
set title = p.title || ' (' || substr(p.id, 1, 6) || ')'
from ranked r
where p.id = r.id
  and r.rn > 1;

alter table public.projects enable row level security;

create unique index if not exists projects_workspace_title_unique
  on public.projects (workspace_id, lower(btrim(title)));
