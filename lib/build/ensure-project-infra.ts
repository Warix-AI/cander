/**
 * Ensure Warix-managed build infra for a Cander project (Phase 1).
 * Server-only. Authz is the caller's responsibility (assertProjectAccess).
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isGitHubAppConfigured } from "@/lib/build/config";
import { ensureProjectRepository } from "@/lib/build/git/project-git-service";
import {
  subdomainCandidates,
  isValidSubdomainLabel,
} from "@/lib/build/subdomain";

export type ProjectInfraRow = {
  id: string;
  workspace_id: string;
  title: string;
  kind: string | null;
  space_id: string | null;
  github_repo_id: number | null;
  github_full_name: string | null;
  github_default_branch: string | null;
  draft_branch: string | null;
  draft_sha: string | null;
  published_sha: string | null;
  cander_subdomain: string | null;
  infra_status: string;
};

export type EnsureProjectInfraResult = {
  projectId: string;
  subdomain: string | null;
  github: {
    configured: boolean;
    skipped: boolean;
    reason?: string;
    repoId?: number;
    fullName?: string;
    draftBranch?: string;
    draftSha?: string;
    created?: boolean;
  };
  infraStatus: "pending" | "ready" | "partial" | "error";
  error?: string;
};

function isBuildKind(kind: string | null | undefined, spaceId: string | null) {
  if (spaceId === "build") return true;
  return kind === "app" || kind === "site";
}

async function allocateSubdomain(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  project: ProjectInfraRow,
): Promise<string> {
  if (
    project.cander_subdomain &&
    isValidSubdomainLabel(project.cander_subdomain)
  ) {
    return project.cander_subdomain;
  }

  const candidates = subdomainCandidates({
    title: project.title,
    projectId: project.id,
  });

  for (const candidate of candidates) {
    const { data: taken } = await admin
      .from("projects")
      .select("id")
      .eq("cander_subdomain", candidate)
      .neq("id", project.id)
      .maybeSingle();
    if (taken) continue;

    const { error } = await admin
      .from("projects")
      .update({
        cander_subdomain: candidate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", project.id)
      .eq("workspace_id", project.workspace_id);

    if (!error) return candidate;

    // Unique race — try next
    if (!/unique|23505/i.test(error.message)) {
      throw new Error(error.message);
    }
  }

  throw new Error("Could not allocate a unique cander subdomain.");
}

export async function loadProjectInfra(
  projectId: string,
  workspaceId: string,
): Promise<ProjectInfraRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("projects")
    .select(
      "id, workspace_id, title, kind, space_id, github_repo_id, github_full_name, github_default_branch, draft_branch, draft_sha, published_sha, cander_subdomain, infra_status",
    )
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: String(data.id),
    workspace_id: String(data.workspace_id),
    title: String(data.title),
    kind: data.kind ? String(data.kind) : null,
    space_id: data.space_id ? String(data.space_id) : null,
    github_repo_id:
      typeof data.github_repo_id === "number" ? data.github_repo_id : null,
    github_full_name: data.github_full_name
      ? String(data.github_full_name)
      : null,
    github_default_branch: data.github_default_branch
      ? String(data.github_default_branch)
      : null,
    draft_branch: data.draft_branch ? String(data.draft_branch) : null,
    draft_sha: data.draft_sha ? String(data.draft_sha) : null,
    published_sha: data.published_sha ? String(data.published_sha) : null,
    cander_subdomain: data.cander_subdomain
      ? String(data.cander_subdomain)
      : null,
    infra_status: String(data.infra_status ?? "pending"),
  };
}

/**
 * Allocate subdomain + ensure Warix GitHub repo (when configured).
 * Safe to call repeatedly (idempotent).
 */
export async function ensureProjectInfra(opts: {
  projectId: string;
  workspaceId: string;
  /** Force even for non-build kinds */
  force?: boolean;
}): Promise<EnsureProjectInfraResult> {
  const project = await loadProjectInfra(opts.projectId, opts.workspaceId);
  if (!project) {
    return {
      projectId: opts.projectId,
      subdomain: null,
      github: { configured: isGitHubAppConfigured(), skipped: true, reason: "project_not_found" },
      infraStatus: "error",
      error: "Project not found.",
    };
  }

  if (!opts.force && !isBuildKind(project.kind, project.space_id)) {
    return {
      projectId: project.id,
      subdomain: project.cander_subdomain,
      github: {
        configured: isGitHubAppConfigured(),
        skipped: true,
        reason: "not_a_build_project",
      },
      infraStatus: (project.infra_status as EnsureProjectInfraResult["infraStatus"]) || "pending",
    };
  }

  const admin = createSupabaseAdminClient();
  let subdomain: string | null = null;
  let infraStatus: EnsureProjectInfraResult["infraStatus"] = "pending";
  let errorMessage: string | undefined;

  try {
    subdomain = await allocateSubdomain(admin, project);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    await admin
      .from("projects")
      .update({
        infra_status: "error",
        updated_at: new Date().toISOString(),
      })
      .eq("id", project.id);
    return {
      projectId: project.id,
      subdomain: null,
      github: {
        configured: isGitHubAppConfigured(),
        skipped: true,
        reason: "subdomain_failed",
      },
      infraStatus: "error",
      error: errorMessage,
    };
  }

  if (!isGitHubAppConfigured()) {
    infraStatus = "partial";
    await admin
      .from("projects")
      .update({
        infra_status: infraStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", project.id);
    return {
      projectId: project.id,
      subdomain,
      github: {
        configured: false,
        skipped: true,
        reason: "github_not_configured",
      },
      infraStatus,
    };
  }

  try {
    const repo = await ensureProjectRepository({
      projectId: project.id,
      title: project.title,
      existingRepoId: project.github_repo_id,
      existingFullName: project.github_full_name,
    });

    infraStatus = "ready";
    await admin
      .from("projects")
      .update({
        github_repo_id: repo.repoId,
        github_full_name: repo.fullName,
        github_default_branch: repo.defaultBranch,
        draft_branch: repo.draftBranch,
        draft_sha: repo.draftSha,
        infra_status: infraStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", project.id);

    // Align draft revision pointer to git SHA (Phase 6).
    try {
      const { syncProjectDraftTipToSha } = await import(
        "@/lib/build/git/revision-sync"
      );
      await syncProjectDraftTipToSha({
        projectId: project.id,
        workspaceId: opts.workspaceId,
        draftSha: repo.draftSha,
        draftBranch: repo.draftBranch,
      });
    } catch {
      /* optional */
    }

    return {
      projectId: project.id,
      subdomain,
      github: {
        configured: true,
        skipped: false,
        repoId: repo.repoId,
        fullName: repo.fullName,
        draftBranch: repo.draftBranch,
        draftSha: repo.draftSha,
        created: repo.created,
      },
      infraStatus,
    };
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    infraStatus = "partial";
    await admin
      .from("projects")
      .update({
        infra_status: infraStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", project.id);
    return {
      projectId: project.id,
      subdomain,
      github: {
        configured: true,
        skipped: false,
        reason: "github_ensure_failed",
      },
      infraStatus,
      error: errorMessage,
    };
  }
}
