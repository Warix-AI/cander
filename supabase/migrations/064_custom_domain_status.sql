-- Phase 10: custom domain verification state (Vercel Domains API).
alter table public.projects
  add column if not exists custom_domain_status text,
  add column if not exists custom_domain_verification jsonb;

alter table public.projects
  drop constraint if exists projects_custom_domain_status_check;

alter table public.projects
  add constraint projects_custom_domain_status_check
  check (
    custom_domain_status is null
    or custom_domain_status in ('pending', 'verified', 'error')
  );

comment on column public.projects.custom_domain is
  'Primary customer domain (hostname, no scheme). Attached on Warix Vercel project.';
comment on column public.projects.custom_domain_status is
  'pending|verified|error — DNS / Vercel verification state.';
comment on column public.projects.custom_domain_verification is
  'Verification records / hints from Vercel Domains API (no secrets).';
