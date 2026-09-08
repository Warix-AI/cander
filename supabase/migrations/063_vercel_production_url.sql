-- Phase 8: pin Vercel production origin for *.cander.app public proxy.
alter table public.projects
  add column if not exists vercel_production_url text;

comment on column public.projects.vercel_production_url is
  'Pinned https origin of the last successful Vercel production deployment (proxy upstream).';
