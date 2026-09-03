-- Allow Studio canvas edits from the Suggest Edit toolbar.

alter table public.studio_project_assets
  drop constraint if exists studio_project_assets_source_check;

alter table public.studio_project_assets
  add constraint studio_project_assets_source_check
  check (source in ('upload', 'generate', 'remove-bg', 'resize', 'suggest-edit'));
