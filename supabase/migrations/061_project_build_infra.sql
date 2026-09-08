-- Phase 1: Warix-managed build infrastructure bindings on projects.
-- GitHub = durable SoT; sandbox/Vercel/Supabase columns reserved for later phases.
-- Server APIs (service role) write these fields after assertProjectAccess.

alter table public.projects
  add column if not exists github_repo_id bigint,
  add column if not exists github_full_name text,
  add column if not exists github_default_branch text,
  add column if not exists draft_branch text,
  add column if not exists draft_sha text,
  add column if not exists published_sha text,
  add column if not exists cander_subdomain text,
  add column if not exists custom_domain text,
  add column if not exists sandbox_session_id text,
  add column if not exists sandbox_status text,
  add column if not exists vercel_project_id text,
  add column if not exists vercel_production_deployment_id text,
  add column if not exists supabase_project_ref text,
  add column if not exists supabase_status text,
  add column if not exists infra_status text not null default 'pending';

alter table public.projects
  drop constraint if exists projects_infra_status_check;

alter table public.projects
  add constraint projects_infra_status_check
  check (infra_status in ('pending', 'ready', 'partial', 'error'));

create unique index if not exists projects_cander_subdomain_unique
  on public.projects (cander_subdomain)
  where cander_subdomain is not null;

create unique index if not exists projects_github_repo_id_unique
  on public.projects (github_repo_id)
  where github_repo_id is not null;

create unique index if not exists projects_custom_domain_unique
  on public.projects (custom_domain)
  where custom_domain is not null;

comment on column public.projects.github_repo_id is
  'Warix-org GitHub repository id (durable code SoT).';
comment on column public.projects.draft_sha is
  'Tip commit SHA on draft_branch (editable).';
comment on column public.projects.published_sha is
  'Commit SHA of last successful production publish.';
comment on column public.projects.cander_subdomain is
  'Assigned *.cander.app label (without domain suffix).';
comment on column public.projects.infra_status is
  'pending|ready|partial|error — server-managed build infra health.';
