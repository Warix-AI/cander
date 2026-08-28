"use client";

import type { BuildRuntimeApi } from "@/lib/api/build-runtime-api";
import type { SpaceEntityApi } from "@/lib/api/space-entity-api";
import { notifyEntityStoreChange } from "@/lib/api/space-entity-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  DEFAULT_PROJECT_FILES,
  projectFileRowToFile,
  projectFileToRow,
  type ProjectFileRow,
} from "@/lib/supabase/build-mapper";
import { previewUrlForProject } from "@/lib/preview-url";
import type {
  PublishInput,
  WorkspaceCtx,
} from "@/lib/space-entities";

async function ensureDefaultFiles(ctx: WorkspaceCtx, projectId: string) {
  const supabase = createSupabaseBrowserClient();
  const rows = DEFAULT_PROJECT_FILES.map((file, index) =>
    projectFileToRow(file, ctx.workspaceId, projectId, index),
  );
  const { error } = await supabase.from("project_files").insert(rows);
  if (error && error.code !== "23505") throw error;
}

export function createSupabaseBuildRuntimeApi(
  entities: SpaceEntityApi,
): BuildRuntimeApi {
  return {
    async startPreview(ctx, projectId) {
      const project = await entities.getProject(ctx, projectId);
      const url = project?.publishedUrl ?? previewUrlForProject(projectId);
      return { projectId, url };
    },

    async listProjectFiles(ctx, projectId) {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("project_files")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as ProjectFileRow[];
      if (!rows.length) {
        await ensureDefaultFiles(ctx, projectId);
        return DEFAULT_PROJECT_FILES;
      }
      return rows.map(projectFileRowToFile);
    },

    async publish(ctx, projectId, input: PublishInput) {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.functions.invoke("build-publish", {
        body: {
          workspaceId: ctx.workspaceId,
          projectId,
          url: input.url ?? null,
          slug: input.slug ?? null,
        },
      });
      if (error) throw error;

      const payload = data as { url?: string } | null;
      const url =
        payload?.url ??
        input.url ??
        (input.slug ? `https://${input.slug}.cander.app` : null) ??
        previewUrlForProject(projectId);

      notifyEntityStoreChange();
      return { url };
    },
  };
}

/** Seed default project files during first-login entity import. */
export async function seedProjectFilesForImport(
  ctx: WorkspaceCtx,
  projectIds: string[],
) {
  for (const projectId of projectIds) {
    await ensureDefaultFiles(ctx, projectId);
  }
}
