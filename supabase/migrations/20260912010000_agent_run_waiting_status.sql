-- Allow waiting as a first-class agent run status (approval / user gate).
alter table public.agent_runs drop constraint if exists agent_runs_status_check;
alter table public.agent_runs
  add constraint agent_runs_status_check
  check (status in (
    'running',
    'completed',
    'failed',
    'cancelled',
    'approval_needed',
    'waiting'
  ));
