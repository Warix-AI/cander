-- Guided website setup brief (8-step chat) persisted on projects.
-- status: setup | building | ready | failed

alter table public.projects
  add column if not exists website_setup_brief jsonb;

comment on column public.projects.website_setup_brief is
  'Guided website create brief: answers, completedSteps (0-8), status setup|building|ready|failed, optional SiteSpec/component refs.';
