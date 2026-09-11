-- Phase 2: idempotent infra orchestrator
--  • one live (starting|active) build sandbox session per project
--  • archived projects: soft delete + teardown ledger

-- 1. Collapse existing duplicates: keep the session the project points at,
--    otherwise the newest; mark the rest stopped. (Orphaned VMs time out.)
with ranked as (
  select cs.id,
         row_number() over (
           partition by cs.project_id
           order by (p.sandbox_session_id = cs.id) desc nulls last, cs.created_at desc
         ) as rn
  from public.computer_sessions cs
  left join public.projects p on p.id = cs.project_id
  where cs.project_id is not null
    and cs.status in ('starting', 'active')
)
update public.computer_sessions cs
set status = 'stopped'
from ranked r
where cs.id = r.id and r.rn > 1;

create unique index if not exists computer_sessions_one_live_per_project
  on public.computer_sessions (project_id)
  where project_id is not null and status in ('starting', 'active');

-- 2. Archived projects are hidden from the product and torn down later.
create index if not exists projects_archived_at_idx
  on public.projects (archived_at)
  where archived_at is not null;

-- Hard delete only after the grace period; the app enforces it, this records it.
alter table public.projects
  add column if not exists teardown_after timestamptz;
