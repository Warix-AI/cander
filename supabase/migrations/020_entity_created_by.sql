-- Creator attribution on shared workspace entities

alter table public.projects
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

alter table public.sources
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

alter table public.project_files
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

create index if not exists projects_created_by_idx
  on public.projects (created_by);

create index if not exists sources_created_by_idx
  on public.sources (created_by);
