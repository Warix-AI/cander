-- Server-authoritative Website Build phase machine (Phase 3).
-- Client cannot mark ready; only project-turn after preview_check.

alter table public.projects
  add column if not exists build_phase text;

alter table public.projects
  drop constraint if exists projects_build_phase_check;

alter table public.projects
  add constraint projects_build_phase_check
  check (
    build_phase is null
    or build_phase in (
      'setup',
      'planning',
      'researching',
      'implementing',
      'validating',
      'booting',
      'preview_check',
      'visual_review',
      'ready',
      'failed'
    )
  );

comment on column public.projects.build_phase is
  'Server-only Website Build state machine. ready only after tip SHA pin + preview_check.';

-- Backfill from website_setup_brief.status when present.
update public.projects
set build_phase = case
  when coalesce(website_setup_brief->>'status', '') = 'ready' then 'ready'
  when coalesce(website_setup_brief->>'status', '') = 'failed' then 'failed'
  when coalesce(website_setup_brief->>'status', '') = 'building' then 'implementing'
  when coalesce(website_setup_brief->>'status', '') = 'setup' then 'setup'
  else build_phase
end
where kind = 'site'
  and build_phase is null;
