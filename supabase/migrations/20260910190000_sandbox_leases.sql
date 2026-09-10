-- One reusable sandbox per project: a short DB lease serializes ensure /
-- repair / reset across serverless instances so two callers never race a
-- second VM for the same project. Leases are advisory and self-expiring.

create table if not exists public.sandbox_leases (
  project_id text primary key,
  holder text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.sandbox_leases enable row level security;
grant all on table public.sandbox_leases to service_role;

-- Returns true when the caller now holds the lease (fresh or re-entrant).
create or replace function public.acquire_sandbox_lease(
  p_project_id text,
  p_holder text,
  p_ttl_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_until timestamptz := now() + make_interval(secs => greatest(p_ttl_seconds, 1));
  v_rows integer;
begin
  insert into public.sandbox_leases (project_id, holder, acquired_at, expires_at)
  values (p_project_id, p_holder, v_now, v_until)
  on conflict (project_id) do update
    set holder = excluded.holder,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at
    where public.sandbox_leases.expires_at < v_now
       or public.sandbox_leases.holder = excluded.holder;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.release_sandbox_lease(
  p_project_id text,
  p_holder text
) returns void
language sql
security definer
set search_path = public
as $$
  delete from public.sandbox_leases
  where project_id = p_project_id and holder = p_holder;
$$;

revoke all on function public.acquire_sandbox_lease(text, text, integer) from public;
revoke all on function public.release_sandbox_lease(text, text) from public;
grant execute on function public.acquire_sandbox_lease(text, text, integer) to service_role;
grant execute on function public.release_sandbox_lease(text, text) to service_role;

-- Sandbox GC scans active build sessions by last activity.
create index if not exists computer_sessions_gc_idx
  on public.computer_sessions (provider, status, last_active_at);
