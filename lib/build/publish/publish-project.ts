/**
 * PublishService — Option B: one Deploy API production deployment per attempt.
 * Git auto-deploy is disabled; main is synced after READY.
 * Server-only. Callers must assertProjectAccess.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isGitHubAppConfigured } from "@/lib/build/config";
import { vercelApiConfigured } from "@/lib/build/vercel/api";
import {
  ensureAppVercelProject,
  ensurePublicVercelProjectAccess,
} from "@/lib/build/vercel/projects";
import { disableGitAutoDeployments } from "@/lib/build/vercel/git-autodeploy";
import { createProductionDeployment } from "@/lib/build/vercel/deployments";
import { promoteDraftShaToDefaultBranch } from "@/lib/build/git/promote-published";
import { ensureDraftSitePackageJson } from "@/lib/build/git/ensure-site-package";
import { gitStoragePointer } from "@/lib/build/git/revision-pointers";
import { ensureProjectInfra } from "@/lib/build/ensure-project-infra";
import { assertNoConcurrentBuild } from "@/lib/build/sandbox/lock";
import { resolveSafePublishedUrl } from "@/lib/build/publish/published-url";
import { preflightPublishTip } from "@/lib/build/publish/preflight";
import {
  beginPublishAttempt,
  findSuccessfulPublishForSha,
  updatePublishAttempt,
  type PublishAttemptRow,
} from "@/lib/build/publish/attempts";

export type PublishProjectResult = {
  ok: boolean;
  status: "published" | "unavailable" | "error";
  publishedSha: string | null;
  publishedUrl: string | null;
  vercelDeploymentId: string | null;
  vercelProjectId: string | null;
  deploymentRecordId: string | null;
  preferredUrl: string | null;
  publishAttemptId?: string | null;
  gitSyncRepairNeeded?: boolean;
  message?: string;
};

function newDeploymentId() {
  return `dep-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function logPublish(
  publishAttemptId: string,
  stage: string,
  extra?: Record<string, unknown>,
) {
  console.info("[cander:publish]", {
    publishAttemptId,
    stage,
    ...extra,
  });
}

function resultFromAttempt(
  attempt: PublishAttemptRow,
  preferredUrl: string | null,
): PublishProjectResult {
  const ok =
    attempt.status === "published" || attempt.status === "git_sync_repair";
  return {
    ok,
    status: ok ? "published" : "error",
    publishedSha: attempt.draft_sha,
    publishedUrl: attempt.published_url,
    vercelDeploymentId: attempt.vercel_deployment_id,
    vercelProjectId: attempt.vercel_project_id,
    deploymentRecordId: null,
    preferredUrl,
    publishAttemptId: attempt.publish_attempt_id,
    gitSyncRepairNeeded: attempt.status === "git_sync_repair",
    message:
      attempt.status === "git_sync_repair"
        ? `Published ${attempt.draft_sha.slice(0, 7)} (Git main sync pending repair).`
        : attempt.status === "published"
          ? `Already published at ${attempt.draft_sha.slice(0, 7)}.`
          : attempt.status === "deploying" ||
              attempt.status === "pending" ||
              attempt.status === "preflight"
            ? `Publish already in progress for ${attempt.draft_sha.slice(0, 7)}.`
            : attempt.error || "Publish failed.",
  };
}

/**
 * Publish the project's current draft tip to production.
 * On Vercel failure, previous published_sha / published_url are left unchanged.
 * draft_sha is never overwritten by published_sha.
 */
export async function publishProject(opts: {
  userId: string;
  projectId: string;
  workspaceId: string;
  preferredUrl?: string | null;
  slug?: string | null;
  publishAttemptId?: string | null;
}): Promise<PublishProjectResult> {
  const publishAttemptId =
    opts.publishAttemptId?.trim() || crypto.randomUUID();

  logPublish(publishAttemptId, "server_entry", {
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
  });

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
      publishAttemptId,
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
      publishAttemptId,
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
      publishAttemptId,
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
          publishAttemptId,
          project: {
            ...retry.data,
            custom_domain: null,
            custom_domain_status: null,
          },
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
      publishAttemptId,
      message: "Project not found.",
    };
  }

  return publishProjectWithRow({
    ...opts,
    publishAttemptId,
    project,
  });
}

async function publishProjectWithRow(opts: {
  userId: string;
  projectId: string;
  workspaceId: string;
  preferredUrl?: string | null;
  slug?: string | null;
  publishAttemptId: string;
  project: Record<string, unknown>;
}): Promise<PublishProjectResult> {
  const project = opts.project;
  const admin = createSupabaseAdminClient();
  const publishAttemptId = opts.publishAttemptId;
  const preferredUrl = opts.preferredUrl ?? null;

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
      preferredUrl,
      publishAttemptId,
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
      preferredUrl,
      publishAttemptId,
      message: "Project is missing github_repo_id.",
    };
  }

  // Soft short-circuit from projects row (also covered by publish_attempts).
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
    if (existingVercelProjectId) {
      try {
        await ensurePublicVercelProjectAccess(existingVercelProjectId);
        await disableGitAutoDeployments(existingVercelProjectId);
      } catch {
        /* still return already-published */
      }
    }
    logPublish(publishAttemptId, "already_published_row", {
      draftSha: draftSha.slice(0, 12),
    });
    return {
      ok: true,
      status: "published",
      publishedSha: draftSha,
      publishedUrl: String(project.published_url),
      vercelDeploymentId: String(project.vercel_production_deployment_id),
      vercelProjectId: existingVercelProjectId,
      deploymentRecordId: null,
      preferredUrl,
      publishAttemptId,
      message: `Already published at ${draftSha.slice(0, 7)}.`,
    };
  }

  const existingSuccess = await findSuccessfulPublishForSha({
    projectId: opts.projectId,
    draftSha,
  });
  if (existingSuccess) {
    logPublish(publishAttemptId, "already_published_attempt", {
      draftSha: draftSha.slice(0, 12),
      existingAttemptId: existingSuccess.publish_attempt_id,
    });
    return resultFromAttempt(existingSuccess, preferredUrl);
  }

  let attemptCreated = false;
  let attempt: PublishAttemptRow;
  try {
    const begun = await beginPublishAttempt({
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      publishAttemptId,
      draftSha,
      meta: { userId: opts.userId },
    });
    attempt = begun.attempt;
    attemptCreated = begun.created;
  } catch (err) {
    return {
      ok: false,
      status: "error",
      publishedSha: null,
      publishedUrl: null,
      vercelDeploymentId: null,
      vercelProjectId: null,
      deploymentRecordId: null,
      preferredUrl,
      publishAttemptId,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (!attemptCreated) {
    logPublish(publishAttemptId, "lock_reuse", {
      existingAttemptId: attempt.publish_attempt_id,
      status: attempt.status,
    });
    return resultFromAttempt(attempt, preferredUrl);
  }

  logPublish(publishAttemptId, "lock_acquired", {
    draftSha: draftSha.slice(0, 12),
  });

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
    const vercelProjectId = vercelProject.vercelProjectId?.trim() || "";
    if (!vercelProjectId) {
      await updatePublishAttempt({
        publishAttemptId,
        projectId: opts.projectId,
        patch: {
          status: "failed",
          error: "missing vercel_project_id",
          completed_at: new Date().toISOString(),
        },
      });
      return {
        ok: false,
        status: "error",
        publishedSha: null,
        publishedUrl: null,
        vercelDeploymentId: null,
        vercelProjectId: null,
        deploymentRecordId: null,
        preferredUrl,
        publishAttemptId,
        message:
          "Publish failed: Vercel project was not bound (missing vercel_project_id).",
      };
    }

    await disableGitAutoDeployments(vercelProjectId);
    logPublish(publishAttemptId, "git_autodeploy_disabled", { vercelProjectId });

    const { data: bound } = await admin
      .from("projects")
      .select("vercel_project_id")
      .eq("id", opts.projectId)
      .eq("workspace_id", opts.workspaceId)
      .maybeSingle();
    if (!bound?.vercel_project_id) {
      await admin
        .from("projects")
        .update({
          vercel_project_id: vercelProjectId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", opts.projectId)
        .eq("workspace_id", opts.workspaceId);
    }

    // May advance draft tip — publishSha is the SHA we deploy (not prior published_sha).
    const ensuredPkg = await ensureDraftSitePackageJson({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
    });
    const publishSha = (ensuredPkg.draftSha || draftSha).toLowerCase();
    const draftBranch = String(project.draft_branch || "cander/draft");

    if (publishSha !== draftSha.toLowerCase()) {
      await updatePublishAttempt({
        publishAttemptId,
        projectId: opts.projectId,
        patch: { draft_sha: publishSha },
      });
    }

    logPublish(publishAttemptId, "validated_draft_sha", {
      publishSha: publishSha.slice(0, 12),
      draftBranch,
    });

    await updatePublishAttempt({
      publishAttemptId,
      projectId: opts.projectId,
      patch: {
        status: "preflight",
        vercel_project_id: vercelProjectId,
      },
    });

    const preflight = await preflightPublishTip({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      draftSha: publishSha,
    });
    if (!preflight.ok) {
      const msg = `Publish blocked — draft tip failed preflight:\n- ${preflight.issues.join("\n- ")}`;
      await updatePublishAttempt({
        publishAttemptId,
        projectId: opts.projectId,
        patch: {
          status: "failed",
          error: msg,
          completed_at: new Date().toISOString(),
        },
      });
      logPublish(publishAttemptId, "preflight_failed", {
        issues: preflight.issues,
      });
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
        vercelProjectId,
        deploymentRecordId: null,
        preferredUrl,
        publishAttemptId,
        message: msg,
      };
    }

    await updatePublishAttempt({
      publishAttemptId,
      projectId: opts.projectId,
      patch: { status: "deploying" },
    });

    logPublish(publishAttemptId, "deploy_api_start", {
      vercelProjectId,
      publishSha: publishSha.slice(0, 12),
      ref: draftBranch,
      trigger: "api_only",
    });

    // Deploy exact draft SHA from draft branch. Git auto-deploy is disabled,
    // so promoting main later will not create a second build.
    const deployment = await createProductionDeployment({
      vercelProjectId,
      projectName: vercelProject.name,
      githubRepoId,
      ref: draftBranch,
      sha: publishSha,
      publishAttemptId,
    });

    logPublish(publishAttemptId, "deploy_api_ready", {
      vercelDeploymentId: deployment.id,
      readyState: deployment.readyState,
      url: deployment.url,
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

    // Persist successful production independently of draft_sha.
    const projectUpdate: Record<string, unknown> = {
      status: "published",
      published_sha: publishSha,
      published_url: publishedUrl,
      vercel_project_id: vercelProjectId,
      vercel_production_deployment_id: deployment.id,
      vercel_production_url: vercelOrigin,
      publish_git_sync_needed: false,
      publish_git_sync_error: null,
      updated_at: now,
    };

    const { error: projectUpErr } = await admin
      .from("projects")
      .update(projectUpdate)
      .eq("id", opts.projectId)
      .eq("workspace_id", opts.workspaceId);
    if (projectUpErr) {
      delete projectUpdate.publish_git_sync_needed;
      delete projectUpdate.publish_git_sync_error;
      delete projectUpdate.vercel_production_url;
      await admin
        .from("projects")
        .update(projectUpdate)
        .eq("id", opts.projectId)
        .eq("workspace_id", opts.workspaceId);
    }

    if (safe.reason === "custom" && verifiedCustom) {
      try {
        const { ensureCustomDomainOnVercelProject } = await import(
          "@/lib/build/vercel/domains"
        );
        await ensureCustomDomainOnVercelProject({
          vercelProjectId,
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

    // Sync main AFTER successful deploy. Failure does not undo production.
    let gitSyncRepairNeeded = false;
    let gitSyncError: string | null = null;
    let promotedMainSha: string | null = null;
    try {
      const promoted = await promoteDraftShaToDefaultBranch({
        projectId: opts.projectId,
        workspaceId: opts.workspaceId,
        sha: publishSha,
      });
      promotedMainSha = promoted.publishedSha;
      logPublish(publishAttemptId, "main_promoted", {
        defaultBranch: promoted.defaultBranch,
        sha: publishSha.slice(0, 12),
      });
    } catch (err) {
      gitSyncRepairNeeded = true;
      gitSyncError = err instanceof Error ? err.message : String(err);
      logPublish(publishAttemptId, "main_promote_failed_after_ready", {
        error: gitSyncError,
      });
      await admin
        .from("projects")
        .update({
          publish_git_sync_needed: true,
          publish_git_sync_error: gitSyncError,
          updated_at: new Date().toISOString(),
        })
        .eq("id", opts.projectId)
        .eq("workspace_id", opts.workspaceId);
    }

    await updatePublishAttempt({
      publishAttemptId,
      projectId: opts.projectId,
      patch: {
        status: gitSyncRepairNeeded ? "git_sync_repair" : "published",
        draft_sha: publishSha,
        promoted_main_sha: promotedMainSha,
        vercel_project_id: vercelProjectId,
        vercel_deployment_id: deployment.id,
        published_url: publishedUrl,
        git_sync_error: gitSyncError,
        completed_at: new Date().toISOString(),
      },
    });

    logPublish(publishAttemptId, "result", {
      ok: true,
      vercelDeploymentId: deployment.id,
      publishedUrl,
      gitSyncRepairNeeded,
    });

    return {
      ok: true,
      status: "published",
      publishedSha: publishSha,
      publishedUrl,
      vercelDeploymentId: deployment.id,
      vercelProjectId,
      deploymentRecordId,
      preferredUrl,
      publishAttemptId,
      gitSyncRepairNeeded,
      message: gitSyncRepairNeeded
        ? `Published ${publishSha.slice(0, 7)} → ${publishedUrl} (Git main sync needs repair: ${gitSyncError})`
        : `Published ${publishSha.slice(0, 7)} → ${publishedUrl}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updatePublishAttempt({
      publishAttemptId,
      projectId: opts.projectId,
      patch: {
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      },
    });
    logPublish(publishAttemptId, "failed", { error: message });
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
      preferredUrl,
      publishAttemptId,
      message,
    };
  }
}
