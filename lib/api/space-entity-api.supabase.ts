"use client";

import type { SpaceEntityApi } from "@/lib/api/space-entity-api";
import { notifyEntityStoreChange, localSpaceEntityStore } from "@/lib/api/space-entity-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  attachmentRowToEntity,
  attachmentToRow,
  briefingRowToEntity,
  briefingToRow,
  deploymentRowToEntity,
  deploymentToRow,
  projectRowToEntity,
  projectToRow,
  sourceRowToEntity,
  sourceToRow,
  type AttachmentRow,
  type BriefingRow,
  type DeploymentRow,
  type ProjectRow,
  type SourceRow,
} from "@/lib/supabase/entity-mapper";
import { assertUniqueProjectTitle } from "@/lib/project-name";
import {
  bumpVersion,
  newEntityTimestamps,
  newId,
  type BriefingAction,
  type BriefingFilter,
  type BriefingItem,
  type CreateDeploymentInput,
  type CreateProjectInput,
  type CreateSourceInput,
  type Deployment,
  type EntityRef,
  type ProjectFilter,
  type SourceFilter,
  type SpaceAttachment,
  type SpaceProject,
  type SpaceSource,
  type UpdateProjectPatch,
  type UpdateSourcePatch,
  type WorkspaceCtx,
} from "@/lib/space-entities";
import type { SpaceId } from "@/lib/types";

function projectKindFromSpace(space: SpaceId): SpaceProject["kind"] {
  if (space === "build") return "app";
  if (space === "research") return "research";
  return "general";
}

function filterBriefing(items: ReturnType<typeof briefingRowToEntity>[], filter?: BriefingFilter) {
  return items.filter((item) => {
    if (filter?.tone && item.tone !== filter.tone) return false;
    if (filter?.connectorId && item.connectorId !== filter.connectorId) return false;
    if (filter?.area === "inbox" && item.connectorId !== "gmail") return false;
    if (filter?.area === "calendar" && item.connectorId !== "calendar") return false;
    if (filter?.area === "customers" && item.connectorId !== "handshake") return false;
    if (item.snoozedUntil && new Date(item.snoozedUntil) > new Date()) return false;
    return true;
  });
}

function filterProjects(
  items: SpaceProject[],
  ctx: WorkspaceCtx,
  space: SpaceId,
  filter?: ProjectFilter,
) {
  return items.filter((project) => {
    if (project.workspaceId !== ctx.workspaceId) return false;
    if (project.space !== space) return false;
    if (filter?.kind && project.kind !== filter.kind) return false;
    if (filter?.status && project.status !== filter.status) return false;
    return true;
  });
}

export function createSupabaseSpaceEntityApi(): SpaceEntityApi {
  return {
    async listProjects(ctx, space, filter) {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .eq("space_id", space)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const items = ((data ?? []) as ProjectRow[]).map(projectRowToEntity);
      return filterProjects(items, ctx, space, filter);
    },

    async listAllProjects(ctx) {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as ProjectRow[]).map(projectRowToEntity);
    },

    async getProject(ctx, id) {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? projectRowToEntity(data as ProjectRow) : null;
    },

    async createProject(ctx, input: CreateProjectInput) {
      const supabase = createSupabaseBrowserClient();
      // Local uniqueness + optimistic seed so openProject works immediately.
      const existing = localSpaceEntityStore.listAllProjects(ctx);
      const title = assertUniqueProjectTitle(existing, input.title);
      const project: SpaceProject = {
        ...newEntityTimestamps(),
        id: newId(),
        workspaceId: ctx.workspaceId,
        space: input.space,
        title,
        summary: input.summary ?? "",
        cover: input.cover,
        kind: input.kind ?? projectKindFromSpace(input.space),
        status: "draft",
        instructions: input.instructions,
        createdBy: ctx.actorId,
      };
      localSpaceEntityStore.seedProject(project);

      void supabase
        .from("projects")
        .insert(projectToRow(project, ctx.actorId))
        .then(({ error }) => {
          if (error) {
            localSpaceEntityStore.deleteProject(ctx, project.id);
            console.warn("[cander] project create failed", error.message);
            return;
          }
          notifyEntityStoreChange();
        });

      return project;
    },

    async updateProject(ctx, id, patch: UpdateProjectPatch) {
      const current = await this.getProject(ctx, id);
      if (!current) throw new Error("Project not found");
      const nextPatch = { ...patch };
      if (nextPatch.title !== undefined) {
        const existing = await this.listAllProjects(ctx);
        nextPatch.title = assertUniqueProjectTitle(existing, nextPatch.title, id);
      }
      const next = bumpVersion({ ...current, ...nextPatch });
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("projects")
        .update(projectToRow(next))
        .eq("id", id)
        .eq("workspace_id", ctx.workspaceId)
        .eq("version", current.version)
        .select()
        .maybeSingle();
      if (error) {
        if (/projects_workspace_title_unique|23505/i.test(error.message)) {
          throw new Error("A project already uses that name.");
        }
        throw error;
      }
      if (!data) throw new Error("Project version conflict — refresh and retry");
      notifyEntityStoreChange();
      return projectRowToEntity(data as ProjectRow);
    },

    async deleteProject(ctx, id) {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", id)
        .eq("workspace_id", ctx.workspaceId);
      if (error) throw error;
      notifyEntityStoreChange();
    },

    async listSources(ctx, opts) {
      const supabase = createSupabaseBrowserClient();
      let query = supabase
        .from("sources")
        .select("*")
        .eq("workspace_id", ctx.workspaceId);
      if (opts?.space) query = query.eq("space_id", opts.space);
      if (opts?.projectId) query = query.eq("project_id", opts.projectId);
      if (opts?.kind) query = query.eq("kind", opts.kind);
      const { data, error } = await query.order("updated_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as SourceRow[])
        .map(sourceRowToEntity)
        .filter((source) => {
          if (opts?.folderId !== undefined && source.folderId !== opts.folderId) {
            return false;
          }
          return true;
        });
    },

    async createSource(ctx, input: CreateSourceInput) {
      const supabase = createSupabaseBrowserClient();
      const source = {
        ...newEntityTimestamps(),
        id: newId(),
        workspaceId: ctx.workspaceId,
        space: input.space,
        title: input.title,
        kind: input.kind,
        projectId: input.projectId,
        url: input.url,
        fileId: input.fileId,
        folderId: input.folderId ?? null,
        citationMeta: input.citationMeta,
        createdBy: ctx.actorId,
      };
      const { error } = await supabase
        .from("sources")
        .insert(sourceToRow(source, ctx.actorId));
      if (error) throw error;
      notifyEntityStoreChange();
      return source;
    },

    async updateSource(ctx, id, patch: UpdateSourcePatch) {
      const supabase = createSupabaseBrowserClient();
      const { data: existing, error: readError } = await supabase
        .from("sources")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .eq("id", id)
        .maybeSingle();
      if (readError) throw readError;
      if (!existing) throw new Error("Source not found");
      const current = sourceRowToEntity(existing as SourceRow);
      const next = bumpVersion({ ...current, ...patch });
      const { data, error } = await supabase
        .from("sources")
        .update(sourceToRow(next))
        .eq("id", id)
        .eq("workspace_id", ctx.workspaceId)
        .eq("version", current.version)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Source version conflict — refresh and retry");
      notifyEntityStoreChange();
      return sourceRowToEntity(data as SourceRow);
    },

    async deleteSource(ctx, id) {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("sources")
        .delete()
        .eq("id", id)
        .eq("workspace_id", ctx.workspaceId);
      if (error) throw error;
      notifyEntityStoreChange();
    },

    async listBriefingItems(ctx, filter) {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("briefing_items")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return filterBriefing(
        ((data ?? []) as BriefingRow[]).map(briefingRowToEntity),
        filter,
      );
    },

    async mutateBriefingItem(ctx, id, action: BriefingAction) {
      const supabase = createSupabaseBrowserClient();
      const { data: existing, error: readError } = await supabase
        .from("briefing_items")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .eq("id", id)
        .maybeSingle();
      if (readError) throw readError;
      if (!existing) throw new Error("Briefing item not found");
      const current = briefingRowToEntity(existing as BriefingRow);

      if (action === "dismiss") {
        const { error } = await supabase
          .from("briefing_items")
          .delete()
          .eq("id", id)
          .eq("workspace_id", ctx.workspaceId);
        if (error) throw error;
        notifyEntityStoreChange();
        return current;
      }

      let next = current;
      if (action === "snooze") {
        const until = new Date();
        until.setHours(until.getHours() + 24);
        next = bumpVersion({ ...current, snoozedUntil: until.toISOString() });
      } else if (action === "mark_ready") {
        next = bumpVersion({ ...current, tone: "ready" });
      }

      const { data, error } = await supabase
        .from("briefing_items")
        .update(briefingToRow(next))
        .eq("id", id)
        .eq("workspace_id", ctx.workspaceId)
        .eq("version", current.version)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Briefing version conflict — refresh and retry");
      notifyEntityStoreChange();
      return briefingRowToEntity(data as BriefingRow);
    },

    async listAttachments(ctx) {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("work_attachments")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as AttachmentRow[]).map(attachmentRowToEntity);
    },

    async attachToWork(ctx, ref: EntityRef) {
      const supabase = createSupabaseBrowserClient();
      const attachment = {
        ...newEntityTimestamps(),
        id: newId(),
        workspaceId: ctx.workspaceId,
        kind: ref.type === "project" ? ("buildApp" as const) : ("connector" as const),
        targetId: ref.id,
        label: ref.label,
      };
      const { error } = await supabase
        .from("work_attachments")
        .upsert(attachmentToRow(attachment), {
          onConflict: "workspace_id,kind,target_id",
        });
      if (error) throw error;
      notifyEntityStoreChange();
      return attachment;
    },

    async detachFromWork(ctx, attachmentId) {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("work_attachments")
        .delete()
        .eq("id", attachmentId)
        .eq("workspace_id", ctx.workspaceId);
      if (error) throw error;
      notifyEntityStoreChange();
    },

    async linkReference(ctx, ref: EntityRef, target: EntityRef) {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("entity_links").upsert(
        {
          id: newId(),
          workspace_id: ctx.workspaceId,
          from_type: ref.type,
          from_id: ref.id,
          to_type: target.type,
          to_id: target.id,
          created_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,from_type,from_id,to_type,to_id" },
      );
      if (error) throw error;
      notifyEntityStoreChange();
    },

    async listDeployments(ctx, projectId) {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("deployments")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as DeploymentRow[]).map(deploymentRowToEntity);
    },

    async createDeployment(ctx, projectId, input: CreateDeploymentInput) {
      const supabase = createSupabaseBrowserClient();
      const deployment = {
        ...newEntityTimestamps(),
        id: newId(),
        projectId,
        workspaceId: ctx.workspaceId,
        url: input.url,
        status: input.status ?? ("live" as const),
      };
      const { error: deployError } = await supabase
        .from("deployments")
        .insert(deploymentToRow(deployment));
      if (deployError) throw deployError;

      const project = await this.getProject(ctx, projectId);
      if (project) {
        await this.updateProject(ctx, projectId, {
          status: "published",
          publishedUrl: input.url,
        });
      }
      notifyEntityStoreChange();
      return deployment;
    },
  };
}

/** Bulk upsert for first-login import from localStorage. */
export async function importEntitiesToSupabase(
  ctx: WorkspaceCtx,
  payload: {
    projects?: SpaceProject[];
    sources?: SpaceSource[];
    briefingItems?: BriefingItem[];
    deployments?: Deployment[];
    attachments?: SpaceAttachment[];
  },
) {
  const supabase = createSupabaseBrowserClient();

  function inWorkspace<T extends { workspaceId: string }>(
    items: T[] | undefined,
  ): T[] {
    return (items ?? []).filter((item) => item.workspaceId === ctx.workspaceId);
  }

  const projects = inWorkspace(payload.projects);
  if (projects.length) {
    const { error } = await supabase
      .from("projects")
      .upsert(projects.map((project) => projectToRow(project)), { onConflict: "id" });
    if (error) throw error;
  }

  const sources = inWorkspace(payload.sources);
  if (sources.length) {
    const { error } = await supabase
      .from("sources")
      .upsert(sources.map((source) => sourceToRow(source)), { onConflict: "id" });
    if (error) throw error;
  }

  const briefing = inWorkspace(payload.briefingItems);
  if (briefing.length) {
    const { error } = await supabase
      .from("briefing_items")
      .upsert(briefing.map(briefingToRow), { onConflict: "id" });
    if (error) throw error;
  }

  const deployments = inWorkspace(payload.deployments);
  if (deployments.length) {
    const { error } = await supabase
      .from("deployments")
      .upsert(deployments.map(deploymentToRow), { onConflict: "id" });
    if (error) throw error;
  }

  const attachments = inWorkspace(payload.attachments);
  if (attachments.length) {
    const { error } = await supabase
      .from("work_attachments")
      .upsert(attachments.map(attachmentToRow), { onConflict: "id" });
    if (error) throw error;
  }
}

export function subscribeEntityRealtime(ctx: WorkspaceCtx, onChange: () => void) {
  const supabase = createSupabaseBrowserClient();
  const channel = supabase
    .channel(`entities:${ctx.workspaceId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "projects",
        filter: `workspace_id=eq.${ctx.workspaceId}`,
      },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sources",
        filter: `workspace_id=eq.${ctx.workspaceId}`,
      },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "briefing_items",
        filter: `workspace_id=eq.${ctx.workspaceId}`,
      },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "deployments",
        filter: `workspace_id=eq.${ctx.workspaceId}`,
      },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "work_attachments",
        filter: `workspace_id=eq.${ctx.workspaceId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
