-- Projects / apps / sites: creator-only unless workspace is shared.
-- Shared = kind = 'business' OR member count >= 2.

create or replace function public.is_shared_workspace(ws_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = ws_id
      and (
        w.kind = 'business'
        or (
          select count(*)::int
          from public.workspace_members wm
          where wm.workspace_id = w.id
        ) >= 2
      )
  );
$$;

revoke all on function public.is_shared_workspace(text) from public;
grant execute on function public.is_shared_workspace(text) to authenticated, service_role;

-- Can the current user access a project row in this workspace?
create or replace function public.can_access_workspace_project(
  ws_id text,
  project_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_workspace_member(ws_id)
    and (
      project_created_by = auth.uid()
      or public.is_shared_workspace(ws_id)
    );
$$;

revoke all on function public.can_access_workspace_project(text, uuid) from public;
grant execute on function public.can_access_workspace_project(text, uuid) to authenticated, service_role;

-- ── projects ─────────────────────────────────────────────────────────────────
drop policy if exists "projects_member" on public.projects;

create policy "projects_select_owner_or_shared"
  on public.projects for select
  using (
    public.is_workspace_member(workspace_id)
    and (
      created_by = auth.uid()
      or created_by is null
      or public.is_shared_workspace(workspace_id)
    )
  );

create policy "projects_insert_owner"
  on public.projects for insert
  with check (
    public.is_workspace_member(workspace_id)
    and created_by = auth.uid()
  );

create policy "projects_update_owner_or_shared"
  on public.projects for update
  using (
    public.can_access_workspace_project(workspace_id, created_by)
  )
  with check (
    public.is_workspace_member(workspace_id)
    and (
      created_by = auth.uid()
      or public.is_shared_workspace(workspace_id)
    )
  );

create policy "projects_delete_owner_or_shared"
  on public.projects for delete
  using (
    public.can_access_workspace_project(workspace_id, created_by)
  );

-- ── sources (project-bound when present; otherwise member + shared or own) ───
drop policy if exists "sources_member" on public.sources;

create policy "sources_select_owner_or_shared"
  on public.sources for select
  using (
    public.is_workspace_member(workspace_id)
    and (
      public.is_shared_workspace(workspace_id)
      or created_by = auth.uid()
      or created_by is null
      or project_id is null
      or exists (
        select 1 from public.projects p
        where p.id = sources.project_id
          and public.can_access_workspace_project(p.workspace_id, p.created_by)
      )
    )
  );

create policy "sources_insert_member"
  on public.sources for insert
  with check (
    public.is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
    and (
      public.is_shared_workspace(workspace_id)
      or project_id is null
      or exists (
        select 1 from public.projects p
        where p.id = sources.project_id
          and public.can_access_workspace_project(p.workspace_id, p.created_by)
      )
    )
  );

create policy "sources_update_owner_or_shared"
  on public.sources for update
  using (
    public.is_workspace_member(workspace_id)
    and (
      public.is_shared_workspace(workspace_id)
      or created_by = auth.uid()
      or exists (
        select 1 from public.projects p
        where p.id = sources.project_id
          and public.can_access_workspace_project(p.workspace_id, p.created_by)
      )
    )
  )
  with check (
    public.is_workspace_member(workspace_id)
  );

create policy "sources_delete_owner_or_shared"
  on public.sources for delete
  using (
    public.is_workspace_member(workspace_id)
    and (
      public.is_shared_workspace(workspace_id)
      or created_by = auth.uid()
      or exists (
        select 1 from public.projects p
        where p.id = sources.project_id
          and public.can_access_workspace_project(p.workspace_id, p.created_by)
      )
    )
  );

-- ── deployments ──────────────────────────────────────────────────────────────
drop policy if exists "deployments_member" on public.deployments;

create policy "deployments_owner_or_shared"
  on public.deployments for all
  using (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.projects p
      where p.id = deployments.project_id
        and public.can_access_workspace_project(p.workspace_id, p.created_by)
    )
  )
  with check (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.projects p
      where p.id = deployments.project_id
        and public.can_access_workspace_project(p.workspace_id, p.created_by)
    )
  );

-- ── project_files ────────────────────────────────────────────────────────────
drop policy if exists "project_files_member" on public.project_files;

create policy "project_files_owner_or_shared"
  on public.project_files for all
  using (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.projects p
      where p.id = project_files.project_id
        and public.can_access_workspace_project(p.workspace_id, p.created_by)
    )
  )
  with check (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.projects p
      where p.id = project_files.project_id
        and public.can_access_workspace_project(p.workspace_id, p.created_by)
    )
  );

-- ── studio_project_assets ────────────────────────────────────────────────────
drop policy if exists "studio_project_assets_member_select" on public.studio_project_assets;
drop policy if exists "studio_project_assets_member_insert" on public.studio_project_assets;
drop policy if exists "studio_project_assets_member_update" on public.studio_project_assets;
drop policy if exists "studio_project_assets_member_delete" on public.studio_project_assets;

create policy "studio_project_assets_select_owner_or_shared"
  on public.studio_project_assets for select
  using (
    public.is_workspace_member(workspace_id)
    and (
      created_by = auth.uid()
      or public.is_shared_workspace(workspace_id)
      or exists (
        select 1 from public.projects p
        where p.id = studio_project_assets.project_id
          and public.can_access_workspace_project(p.workspace_id, p.created_by)
      )
    )
  );

create policy "studio_project_assets_insert_own"
  on public.studio_project_assets for insert
  with check (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.projects p
      where p.id = studio_project_assets.project_id
        and public.can_access_workspace_project(p.workspace_id, p.created_by)
    )
  );

create policy "studio_project_assets_update_own"
  on public.studio_project_assets for update
  using (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  )
  with check (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

create policy "studio_project_assets_delete_own"
  on public.studio_project_assets for delete
  using (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

-- ── project_agents ───────────────────────────────────────────────────────────
drop policy if exists "project_agents_member_select" on public.project_agents;
drop policy if exists "project_agents_member_insert" on public.project_agents;
drop policy if exists "project_agents_member_update" on public.project_agents;
drop policy if exists "project_agents_member_delete" on public.project_agents;

create policy "project_agents_select_owner_or_shared"
  on public.project_agents for select
  using (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.projects p
      where p.id = project_agents.project_id
        and public.can_access_workspace_project(p.workspace_id, p.created_by)
    )
  );

create policy "project_agents_insert_own"
  on public.project_agents for insert
  with check (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.projects p
      where p.id = project_agents.project_id
        and public.can_access_workspace_project(p.workspace_id, p.created_by)
    )
  );

create policy "project_agents_update_owner_or_shared"
  on public.project_agents for update
  using (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.projects p
      where p.id = project_agents.project_id
        and public.can_access_workspace_project(p.workspace_id, p.created_by)
    )
  )
  with check (
    public.is_workspace_member(workspace_id)
  );

create policy "project_agents_delete_owner_or_shared"
  on public.project_agents for delete
  using (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.projects p
      where p.id = project_agents.project_id
        and public.can_access_workspace_project(p.workspace_id, p.created_by)
    )
  );

-- ── shared_markdown_docs writes stay creator-owned; tighten update ───────────
drop policy if exists "shared_markdown_docs_member_update" on public.shared_markdown_docs;
create policy "shared_markdown_docs_member_update"
  on public.shared_markdown_docs for update
  using (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  )
  with check (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  );
