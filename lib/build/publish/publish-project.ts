/**
 * PublishService — promote draft tip to production (git + Vercel).
 * Server-only. Callers must assertProjectAccess.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isGitHubAppConfigured } from "@/lib/build/config";
import { vercelApiConfigured } from "@/lib/build/vercel/api";
import { ensureAppVercelProject } from "@/lib/build/vercel/projects";
import { createProductionDeployment } from "@/lib/build/vercel/deployments";
import { promoteDraftShaToDefaultBranch } from "@/lib/build/git/promote-published";
import { gitStoragePointer } from "@/lib/build/git/revision-pointers";
import { ensureProjectInfra } from "@/lib/build/ensure-project-infra";

export type PublishProjectResult = {
  ok: boolean;
  status: "published" | "unavailable" | "error";
  publishedSha: string | null;
  publishedUrl: string | null;
  vercelDeploymentId: string | null;
  vercelProjectId: string | null;
  deploymentRecordId: string | null;
  preferredUrl: string | null;
  message?: string;
};

function newDeploymentId() {
  return `dep-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/**
 * Publish the project's current draft tip to production.
 * On Vercel failure, previous published_sha / published_url are left unchanged.
 */
export async function publishProject(opts: {
  userId: string;
  projectId: string;
  workspaceId: string;
  /** Preferred public URL (e.g. https://slug.cander.app) — stored when provided. */
  preferredUrl?: string | null;
  slug?: string | null;
}): Promise<PublishProjectResult> {
  if (!isGitHubAppConfigured()) {
    return {
      ok: false,
      status: "unavailable",
      publishedSha: null,
      publishedUrl: null,
      vercelDeploymentId: null,
      vercelProjectId: null,
      deploymentRecordId: null,
      preferredUrl: opts.preferredUrl ?? null,
      message: "GitHub App is not configured on this server.",
    };
  }
  if (!vercelApiConfigured()) {
    return {
      ok: false,
      status: "unavailable",
      publishedSha: null,
      publishedUrl: null,
      vercelDeploymentId: null,
      vercelProjectId: null,
      deploymentRecordId: null,
      preferredUrl: opts.preferredUrl ?? null,
      message: "VERCEL_TOKEN is required for production deploys.",
    };
  }

  await ensureProjectInfra({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
  });

  const admin = createSupabaseAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .select(
      "id, title, github_full_name, github_repo_id, draft_branch, draft_sha, published_sha, published_url, cander_subdomain, vercel_project_id",
    )
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();

  if (error || !project) {
    return {
      ok: false,
      status: "error",
      publishedSha: null,
      publishedUrl: null,
      vercelDeploymentId: null,
      vercelProjectId: null,
      deploymentRecordId: null,
      preferredUrl: opts.preferredUrl ?? null,
      message: "Project not found.",
    };
  }

  const draftSha = project.draft_sha ? String(project.draft_sha) : null;
  const githubRepoId = project.github_repo_id
    ? Number(project.github_repo_id)
    : NaN;
  if (!draftSha) {
    return {
      ok: false,
      status: "error",
      publishedSha: project.published_sha
        ? String(project.published_sha)
        : null,
      publishedUrl: project.published_url
        ? String(project.published_url)
        : null,
      vercelDeploymentId: null,
      vercelProjectId: project.vercel_project_id
        ? String(project.vercel_project_id)
        : null,
      deploymentRecordId: null,
      preferredUrl: opts.preferredUrl ?? null,
      message: "Nothing to publish — draft tip is empty. Save a draft first.",
    };
  }
  if (!Number.isFinite(githubRepoId)) {
    return {
      ok: false,
      status: "error",
      publishedSha: null,
      publishedUrl: null,
      vercelDeploymentId: null,
      vercelProjectId: null,
      deploymentRecordId: null,
      preferredUrl: opts.preferredUrl ?? null,
      message: "Project is missing github_repo_id.",
    };
  }

  const preferred =
    opts.preferredUrl?.trim() ||
    (opts.slug?.trim()
      ? `https://${opts.slug.trim().toLowerCase()}.cander.app`
      : project.cander_subdomain
        ? `https://${project.cander_subdomain}.cander.app`
        : null);

  try {
    const vercelProject = await ensureAppVercelProject({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
    });

    const draftBranch = String(project.draft_branch || "cander/draft");
    const deployment = await createProductionDeployment({
      vercelProjectId: vercelProject.vercelProjectId,
      projectName: vercelProject.name,
      githubRepoId,
      ref: draftBranch,
      sha: draftSha,
    });

    // Deploy succeeded — promote main + commit published pointers.
    await promoteDraftShaToDefaultBranch({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      sha: draftSha,
    });

    const publishedUrl = preferred || deployment.url;
    const now = new Date().toISOString();
    const deploymentRecordId = newDeploymentId();

    await admin
      .from("projects")
      .update({
        status: "published",
        published_sha: draftSha,
        published_url: publishedUrl,
        vercel_project_id: vercelProject.vercelProjectId,
        vercel_production_deployment_id: deployment.id,
        updated_at: now,
      })
      .eq("id", opts.projectId)
      .eq("workspace_id", opts.workspaceId);

    // Best-effort deployments row (columns from 062 may be absent until migrated).
    const deployRow: Record<string, unknown> = {
      id: deploymentRecordId,
      workspace_id: opts.workspaceId,
      project_id: opts.projectId,
      url: publishedUrl,
      status: "live",
      version: 1,
      created_at: now,
      updated_at: now,
      vercel_deployment_id: deployment.id,
      git_sha: draftSha,
      kind: "production",
    };
    const { error: depErr } = await admin.from("deployments").insert(deployRow);
    if (depErr) {
      // Retry without Phase 7 columns if migration not applied yet.
      const { error: depErr2 } = await admin.from("deployments").insert({
        id: deploymentRecordId,
        workspace_id: opts.workspaceId,
        project_id: opts.projectId,
        url: publishedUrl,
        status: "live",
        version: 1,
        created_at: now,
        updated_at: now,
      });
      if (depErr2) {
        console.warn("[cander] deployments insert", depErr2.message);
      }
    }

    // Published revision pointer = git:{sha}
    try {
      const pointer = gitStoragePointer(draftSha);
      const { data: tip } = await admin
        .from("project_revisions")
        .select("id")
        .eq("project_id", opts.projectId)
        .eq("kind", "draft_tip")
        .maybeSingle();
      const { data: publishedRev } = await admin
        .from("project_revisions")
        .insert({
          project_id: opts.projectId,
          workspace_id: opts.workspaceId,
          kind: "published",
          parent_revision_id: tip?.id ?? null,
          created_by: opts.userId,
          storage_pointer: pointer,
        })
        .select("id")
        .single();
      if (publishedRev?.id) {
        await admin
          .from("projects")
          .update({
            published_revision_id: publishedRev.id,
            updated_at: now,
          })
          .eq("id", opts.projectId)
          .eq("workspace_id", opts.workspaceId);
      }
    } catch (err) {
      console.warn("[cander] published revision pointer", err);
    }

    return {
      ok: true,
      status: "published",
      publishedSha: draftSha,
      publishedUrl,
      vercelDeploymentId: deployment.id,
      vercelProjectId: vercelProject.vercelProjectId,
      deploymentRecordId,
      preferredUrl: preferred,
      message: `Published ${draftSha.slice(0, 7)} to production.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "error",
      publishedSha: project.published_sha
        ? String(project.published_sha)
        : null,
      publishedUrl: project.published_url
        ? String(project.published_url)
        : null,
      vercelDeploymentId: null,
      vercelProjectId: project.vercel_project_id
        ? String(project.vercel_project_id)
        : null,
      deploymentRecordId: null,
      preferredUrl: preferred,
      message,
    };
  }
}
