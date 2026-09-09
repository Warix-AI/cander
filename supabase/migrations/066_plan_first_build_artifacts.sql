-- Plan-first Build artifacts (private IR; BuildPlan markdown stays DB-only).
-- Companion to website_setup_brief (guided answers).

alter table public.projects
  add column if not exists project_spec jsonb,
  add column if not exists build_plan jsonb,
  add column if not exists research_manifest jsonb,
  add column if not exists implementation_manifest jsonb;

comment on column public.projects.project_spec is
  'Plan-first ProjectSpec: kind, goals, audience, CTAs, constraints; app fields reserved.';
comment on column public.projects.build_plan is
  'Plan-first BuildPlan: { markdown, json, version } — markdown is private (not customer git).';
comment on column public.projects.research_manifest is
  'Plan-first ResearchManifest: 21st candidates, selections, deps, primitives, fallbacks.';
comment on column public.projects.implementation_manifest is
  'Plan-first ImplementationManifest: files, packages, routes, tasks, validation report.';
