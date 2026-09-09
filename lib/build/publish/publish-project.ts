/**
 * PublishService — promote draft tip to production (git + Vercel).
 * Server-only. Callers must assertProjectAccess.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isGitHubAppConfigured } from "@/lib/build/config";
import { vercelApiConfigured } from "@/lib/build/vercel/api";
import {
  ensureAppVercelProject,
  ensurePublicVercelProjectAccess,
} from "@/lib/build/vercel/projects";
import { createProductionDeployment } from "@/lib/build/vercel/deployments";
import { promoteDraftShaToDefaultBranch } from "@/lib/build/git/promote-published";
import { ensureDraftSitePackageJson } from "@/lib/build/git/ensure-site-package";
import { gitStoragePointer } from "@/lib/build/git/revision-pointers";
import { ensureProjectInfra } from "@/lib/build/ensure-project-infra";
import { assertNoConcurrentBuild } from "@/lib/build/sandbox/lock";
import { resolveSafePublishedUrl } from "@/lib/build/publish/published-url";

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

  try {
    await assertNoConcurrentBuild({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
    });
  } catch (err) {
    return {
      ok: false,
      status: "error",
      publishedSha: null,
      publishedUrl: null,
      vercelDeploymentId: null,
      vercelProjectId: null,
      deploymentRecordId: null,
      preferredUrl: opts.preferredUrl ?? null,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .select(
      "id, title, github_full_name, github_repo_id, draft_branch, draft_sha, published_sha, published_url, cander_subdomain, vercel_project_id, vercel_production_deployment_id, vercel_production_url, custom_domain, custom_domain_status",
    )
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();

  if (error || !project) {
    // Retry without Phase 10 columns if migration not applied.
    if (error) {
      const retry = await admin
        .from("projects")
        .select(
          "id, title, github_full_name, github_repo_id, draft_branch, draft_sha, published_sha, published_url, cander_subdomain, vercel_project_id, vercel_production_deployment_id, vercel_production_url",
        )
        .eq("id", opts.projectId)
        .eq("workspace_id", opts.workspaceId)
        .maybeSingle();
      if (retry.data) {
        return publishProjectWithRow({
          ...opts,
          project: { ...retry.data, custom_domain: null, custom_domain_status: null },
        });
      }
    }
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

  return publishProjectWithRow({ ...opts, project });
}

async function publishProjectWithRow(opts: {
  userId: string;
  projectId: string;
  workspaceId: string;
  preferredUrl?: string | null;
  slug?: string | null;
  project: Record<string, unknown>;
}): Promise<PublishProjectResult> {
  const project = opts.project;
  const admin = createSupabaseAdminClient();

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

  // Idempotent: already live at this tip.
  const priorSha = project.published_sha
    ? String(project.published_sha).toLowerCase()
    : "";
  if (
    priorSha === draftSha.toLowerCase() &&
    project.vercel_production_deployment_id &&
    project.published_url
  ) {
    const existingVercelProjectId = project.vercel_project_id
      ? String(project.vercel_project_id)
      : null;
    if (!existingVercelProjectId) {
      return {
        ok: false,
        status: "error",
        publishedSha: draftSha,
        publishedUrl: String(project.published_url),
        vercelDeploymentId: String(project.vercel_production_deployment_id),
        vercelProjectId: null,
        deploymentRecordId: null,
        preferredUrl: opts.preferredUrl ?? null,
        message:
          "Published deployment is missing its Vercel project binding. Republish after ensuring project infrastructure.",
      };
    }
    try {
      await ensurePublicVercelProjectAccess(existingVercelProjectId);
    } catch (err) {
      return {
        ok: false,
        status: "error",
        publishedSha: draftSha,
        publishedUrl: String(project.published_url),
        vercelDeploymentId: String(project.vercel_production_deployment_id),
        vercelProjectId: existingVercelProjectId,
        deploymentRecordId: null,
        preferredUrl: opts.preferredUrl ?? null,
        message: err instanceof Error ? err.message : String(err),
      };
    }
    return {
      ok: true,
      status: "published",
      publishedSha: draftSha,
      publishedUrl: String(project.published_url),
      vercelDeploymentId: String(project.vercel_production_deployment_id),
      vercelProjectId: existingVercelProjectId,
      deploymentRecordId: null,
      preferredUrl: opts.preferredUrl ?? null,
      message: `Already published at ${draftSha.slice(0, 7)}.`,
    };
  }

  const verifiedCustom =
    String(project.custom_domain_status || "") === "verified" &&
    project.custom_domain
      ? String(project.custom_domain)
      : null;

  try {
    const vercelProject = await ensureAppVercelProject({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
    });

    // Vercel errors with "No Next.js version detected" if package.json lacks next.
    const ensuredPkg = await ensureDraftSitePackageJson({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
    });
    const publishSha = ensuredPkg.draftSha || draftSha;

    // Promote draft → default branch first. Production deploys from a
    // non-production ref (cander/draft) often build then land in ERROR.
    const promoted = await promoteDraftShaToDefaultBranch({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      sha: publishSha,
    });

    const deployment = await createProductionDeployment({
      vercelProjectId: vercelProject.vercelProjectId,
      projectName: vercelProject.name,
      githubRepoId,
      ref: promoted.defaultBranch,
      sha: publishSha,
    });

    const vercelOrigin = (() => {
      try {
        return new URL(deployment.url).origin;
      } catch {
        return deployment.url;
      }
    })();

    const safe = resolveSafePublishedUrl({
      preferredUrl: opts.preferredUrl,
      slug: opts.slug,
      ctx: {
        canderSubdomain: project.cander_subdomain
          ? String(project.cander_subdomain)
          : null,
        verifiedCustomDomain: verifiedCustom,
      },
      fallbackUrl: deployment.url,
    });
    const publishedUrl = safe.url;
    const now = new Date().toISOString();
    const deploymentRecordId = newDeploymentId();

    const projectUpdate: Record<string, string> = {
      status: "published",
      published_sha: publishSha,
      published_url: publishedUrl,
      vercel_project_id: vercelProject.vercelProjectId,
      vercel_production_deployment_id: deployment.id,
      vercel_production_url: vercelOrigin,
      updated_at: now,
    };

    const { error: projectUpErr } = await admin
      .from("projects")
      .update(projectUpdate)
      .eq("id", opts.projectId)
      .eq("workspace_id", opts.workspaceId);
    if (projectUpErr) {
      delete projectUpdate.vercel_production_url;
      await admin
        .from("projects")
        .update(projectUpdate)
        .eq("id", opts.projectId)
        .eq("workspace_id", opts.workspaceId);
    }

    // If publishing to a verified custom domain, ensure it is attached on Vercel.
    if (safe.reason === "custom" && verifiedCustom) {
      try {
        const { ensureCustomDomainOnVercelProject } = await import(
          "@/lib/build/vercel/domains"
        );
        await ensureCustomDomainOnVercelProject({
          vercelProjectId: vercelProject.vercelProjectId,
          domain: verifiedCustom,
        });
      } catch (err) {
        console.warn("[cander] custom domain attach on publish", err);
      }
    }

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
      git_sha: publishSha,
      kind: "production",
    };
    const { error: depErr } = await admin.from("deployments").insert(deployRow);
    if (depErr) {
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

    try {
      const pointer = gitStoragePointer(publishSha);
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
      publishedSha: publishSha,
      publishedUrl,
      vercelDeploymentId: deployment.id,
      vercelProjectId: vercelProject.vercelProjectId,
      deploymentRecordId,
      preferredUrl: opts.preferredUrl ?? null,
      message: `Published ${publishSha.slice(0, 7)} → ${publishedUrl}`,
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
      preferredUrl: opts.preferredUrl ?? null,
      message,
    };
  }
}
