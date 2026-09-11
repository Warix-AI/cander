-- Website Builder V2 (config-driven) — parallel to V1 coding-agent builder.
-- Does not alter V1 job/sandbox behavior. Existing projects default to v1.

-- ── Project discriminator ────────────────────────────────────────────────────
alter table public.projects
  add column if not exists builder_version text not null default 'v1'
    check (builder_version in ('v1', 'v2_config'));

alter table public.projects
  add column if not exists builder_v2_config jsonb;

alter table public.projects
  add column if not exists builder_v2_blueprint_id text;

alter table public.projects
  add column if not exists builder_v2_blueprint_version integer;

comment on column public.projects.builder_version is
  'v1 = coding-agent sandbox builder; v2_config = blueprint/config assembly. Immutable after create for normal UX.';

create index if not exists projects_builder_version_idx
  on public.projects (builder_version);

-- ── Catalog: business categories (routing only) ──────────────────────────────
create table if not exists public.builder_v2_categories (
  id text primary key,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Catalog: theme / behavior / header / footer presets ─────────────────────
create table if not exists public.builder_v2_theme_presets (
  id text primary key,
  name text not null,
  description text not null default '',
  tokens jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.builder_v2_behavior_presets (
  id text primary key,
  name text not null,
  description text not null default '',
  tokens jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.builder_v2_header_variants (
  id text primary key,
  name text not null,
  description text not null default '',
  renderer_id text not null,
  content_schema jsonb not null default '{}'::jsonb,
  config_schema jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.builder_v2_footer_variants (
  id text primary key,
  name text not null,
  description text not null default '',
  renderer_id text not null,
  content_schema jsonb not null default '{}'::jsonb,
  config_schema jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Catalog: component types + variants (max 3 variants enforced in app) ─────
create table if not exists public.builder_v2_component_types (
  id text primary key,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.builder_v2_component_variants (
  id text primary key,
  component_type_id text not null references public.builder_v2_component_types (id) on delete cascade,
  name text not null,
  description text not null default '',
  renderer_id text not null,
  content_schema jsonb not null default '{}'::jsonb,
  config_schema jsonb not null default '{}'::jsonb,
  capabilities jsonb not null default '[]'::jsonb,
  responsive_rules jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (component_type_id, id)
);

create index if not exists builder_v2_component_variants_type_idx
  on public.builder_v2_component_variants (component_type_id);

-- ── Catalog: blueprints (admin-manageable) ───────────────────────────────────
create table if not exists public.builder_v2_blueprints (
  id text primary key,
  name text not null,
  category_id text not null references public.builder_v2_categories (id),
  description text not null default '',
  status text not null default 'active'
    check (status in ('draft', 'active', 'inactive')),
  version integer not null default 1,
  theme_preset_id text references public.builder_v2_theme_presets (id),
  behavior_preset_id text references public.builder_v2_behavior_presets (id),
  header_variant_id text references public.builder_v2_header_variants (id),
  footer_variant_id text references public.builder_v2_footer_variants (id),
  -- Full structural definition: pages, sections, defaults, rules.
  definition jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists builder_v2_blueprints_category_idx
  on public.builder_v2_blueprints (category_id);
create index if not exists builder_v2_blueprints_status_idx
  on public.builder_v2_blueprints (status);

-- ── Project config revisions (for rollback / history) ────────────────────────
create table if not exists public.builder_v2_config_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects (id) on delete cascade,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  revision integer not null,
  config jsonb not null,
  summary text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, revision)
);

create index if not exists builder_v2_config_revisions_project_idx
  on public.builder_v2_config_revisions (project_id, revision desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.builder_v2_categories enable row level security;
alter table public.builder_v2_theme_presets enable row level security;
alter table public.builder_v2_behavior_presets enable row level security;
alter table public.builder_v2_header_variants enable row level security;
alter table public.builder_v2_footer_variants enable row level security;
alter table public.builder_v2_component_types enable row level security;
alter table public.builder_v2_component_variants enable row level security;
alter table public.builder_v2_blueprints enable row level security;
alter table public.builder_v2_config_revisions enable row level security;

-- Catalog is readable by any authenticated member (shared product catalog).
do $$
declare
  t text;
begin
  foreach t in array array[
    'builder_v2_categories',
    'builder_v2_theme_presets',
    'builder_v2_behavior_presets',
    'builder_v2_header_variants',
    'builder_v2_footer_variants',
    'builder_v2_component_types',
    'builder_v2_component_variants',
    'builder_v2_blueprints'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select', t
    );
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

drop policy if exists builder_v2_config_revisions_select on public.builder_v2_config_revisions;
create policy builder_v2_config_revisions_select
  on public.builder_v2_config_revisions for select
  using (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.can_access_workspace_project(p.workspace_id, p.created_by)
    )
  );

drop policy if exists builder_v2_config_revisions_insert on public.builder_v2_config_revisions;
create policy builder_v2_config_revisions_insert
  on public.builder_v2_config_revisions for insert
  with check (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.can_access_workspace_project(p.workspace_id, p.created_by)
    )
  );

grant select, insert on public.builder_v2_config_revisions to authenticated;
grant all on public.builder_v2_config_revisions to service_role;
