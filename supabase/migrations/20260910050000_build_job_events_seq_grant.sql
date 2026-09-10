-- Builder event writes come from the service role (job-token routes and the
-- runner). This project's default privileges only grant sequences owned by
-- `postgres` to `postgres`, so inserts failed with
-- "permission denied for sequence build_job_events_id_seq".
grant usage, select on sequence public.build_job_events_id_seq to service_role;
grant usage, select on sequence public.build_job_events_id_seq to postgres;
grant all on table public.build_job_events to service_role;
