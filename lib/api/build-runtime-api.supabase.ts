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
      const cols = "path, label, sort_order, content";
      const { data, error } = await supabase
        .from("project_files")
        .select(cols)
        .eq("workspace_id", ctx.workspaceId)
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as ProjectFileRow[];
      if (!rows.length) {
        await ensureDefaultFiles(ctx, projectId);
        return DEFAULT_PROJECT_FILES;
      }
      return rows.map(projectFileRowToFile);
    },

    async publish(ctx, projectId, input: PublishInput) {
      // Phase 7: real git → Vercel production when build-infra is configured.
      const { publishProjectClient } = await import(
        "@/lib/api/project-publish-client"
      );
      const infra = await publishProjectClient({
        projectId,
        workspaceId: ctx.workspaceId,
        url: input.url ?? null,
        slug: input.slug ?? null,
      });

      if (infra?.ok && infra.url) {
        notifyEntityStoreChange();
        return { url: infra.url };
      }

      const buildSandboxOn =
        (typeof process !== "undefined" &&
          (process.env.NEXT_PUBLIC_CANDER_BUILD_SANDBOX || "")
            .trim()
            .toLowerCase() === "1") ||
        false;

      if (infra && !infra.ok) {
        // Phase 9: never fake live when build-infra is enabled, or on hard errors.
        if (infra.status !== "unavailable" || buildSandboxOn) {
          throw new Error(
            infra.error ||
              infra.message ||
              "Production publish failed.",
          );
        }
      }

      // Legacy Edge stub only when build-infra flag is off and APIs are unavailable.
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
      void import("@/lib/ai/intelligence/revisions").then((m) =>
        m.promoteDraftToPublished({
          projectId,
          workspaceId: ctx.workspaceId,
          actorId: ctx.actorId,
          publishedUrl: url,
        }),
      );
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
