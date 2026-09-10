-- Publish attempts run in the background (after()). A heartbeat lets a new
-- request tell an in-flight attempt apart from one whose worker died, so the
-- lock can be reclaimed instead of blocking the project forever.
alter table public.publish_attempts
  add column if not exists heartbeat_at timestamptz;

update public.publish_attempts
  set heartbeat_at = coalesce(heartbeat_at, updated_at, started_at)
  where heartbeat_at is null;

create index if not exists publish_attempts_project_started_idx
  on public.publish_attempts (project_id, started_at desc);
