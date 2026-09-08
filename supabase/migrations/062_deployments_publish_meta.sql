-- Phase 7: production publish metadata on deployments.
alter table public.deployments
  add column if not exists vercel_deployment_id text,
  add column if not exists git_sha text,
  add column if not exists kind text;

alter table public.deployments
  drop constraint if exists deployments_kind_check;

alter table public.deployments
  add constraint deployments_kind_check
  check (kind is null or kind in ('preview', 'production'));

comment on column public.deployments.vercel_deployment_id is
  'Vercel deployment id for this publish (when hosted on Warix Vercel).';
comment on column public.deployments.git_sha is
  'Git commit SHA that was published.';
comment on column public.deployments.kind is
  'preview|production — production = Phase 7 publish.';
