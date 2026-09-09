/**
 * Production Vercel permission + Option B probe.
 * Uses vercelFetch / production env (VERCEL_TOKEN + VERCEL_TEAM_ID).
 * Never logs token values. Server-only.
 */

import { getVercelTeamConfig } from "@/lib/build/config";
import { vercelFetch } from "@/lib/build/vercel/api";

export type ProbeStep = {
  step: string;
  method: string;
  path: string;
  teamIdPresent: boolean;
  status: number;
  vercelErrorCode?: string | null;
  vercelErrorAction?: string | null;
  vercelErrorResource?: string | null;
  vercelErrorMessage?: string | null;
  projectId?: string | null;
  deploymentId?: string | null;
  projectCount?: number;
  projectNames?: string[];
  delta?: number;
};

export type ProductionVercelProbeResult = {
  ok: boolean;
  stoppedReason:
    | "create_forbidden"
    | "create_failed"
    | "option_b_failed"
    | "misconfigured"
    | "passed"
    | "error";
  teamIdConfigured: boolean;
  platformProjectIdConfigured: boolean;
  tokenConfigured: boolean;
  steps: ProbeStep[];
  disposableProjectId?: string | null;
  optionBProjectId?: string | null;
};

function teamIdFromConfig(): string | null {
  return getVercelTeamConfig().teamId;
}

async function readVercelError(res: Response): Promise<{
  code: string | null;
  action: string | null;
  resource: string | null;
  message: string | null;
}> {
  try {
    const body = (await res.json()) as {
      error?: {
        code?: string;
        action?: string;
        resource?: string;
        message?: string;
      };
      message?: string;
    };
    const err = body.error || {};
    return {
      code: err.code ?? null,
      action: err.action ?? null,
      resource: err.resource ?? null,
      message: err.message ?? body.message ?? null,
    };
  } catch {
    return { code: null, action: null, resource: null, message: null };
  }
}

async function countProductionDeployments(
  vercelProjectId: string,
): Promise<{ status: number; count: number; error?: ProbeStep["vercelErrorCode"] }> {
  const path = `/v6/deployments?projectId=${encodeURIComponent(vercelProjectId)}&target=production&limit=50`;
  const res = await vercelFetch(path);
  if (!res.ok) {
    const err = await readVercelError(res);
    return { status: res.status, count: -1, error: err.code };
  }
  const body = (await res.json()) as { deployments?: unknown[] };
  return { status: res.status, count: (body.deployments || []).length };
}

/**
 * 1) List Warix projects via production vercelFetch
 * 2) Create disposable project; delete on success
 * 3) If create works, run Option B (disable git auto-deploy + one Deploy API)
 */
export async function runProductionVercelPermissionProbe(opts?: {
  /** GitHub repo full name for Option B git-linked project */
  optionBRepo?: string;
  /** Numeric GitHub repo id for Deploy API gitSource */
  optionBRepoId?: number;
  /** Commit SHA to deploy */
  optionBSha?: string;
  /** Branch/ref for Deploy API */
  optionBRef?: string;
}): Promise<ProductionVercelProbeResult> {
  const steps: ProbeStep[] = [];
  const cfg = getVercelTeamConfig();
  const teamIdConfigured = Boolean(cfg.teamId);
  const tokenConfigured = Boolean(cfg.token);
  const platformProjectIdConfigured = Boolean(cfg.platformProjectId);

  if (!tokenConfigured || !teamIdConfigured) {
    return {
      ok: false,
      stoppedReason: "misconfigured",
      teamIdConfigured,
      platformProjectIdConfigured,
      tokenConfigured,
      steps,
    };
  }

  const teamId = teamIdFromConfig();

  // --- List projects ---
  {
    const path = "/v9/projects?limit=20";
    const res = await vercelFetch(path);
    const err = res.ok ? null : await readVercelError(res);
    let projectCount = 0;
    let projectNames: string[] = [];
    if (res.ok) {
      const body = (await res.json()) as {
        projects?: Array<{ id?: string; name?: string }>;
      };
      const projects = body.projects || [];
      projectCount = projects.length;
      projectNames = projects.map((p) => String(p.name || p.id || "")).slice(0, 20);
    }
    steps.push({
      step: "list_projects",
      method: "GET",
      path: "/v9/projects",
      teamIdPresent: Boolean(teamId),
      status: res.status,
      vercelErrorCode: err?.code,
      vercelErrorAction: err?.action,
      vercelErrorResource: err?.resource,
      vercelErrorMessage: err?.message,
      projectCount,
      projectNames,
    });
    console.info("[cander:vercel-probe]", {
      step: "list_projects",
      status: res.status,
      projectCount,
      teamIdPresent: Boolean(teamId),
      errorCode: err?.code,
      errorAction: err?.action,
      errorResource: err?.resource,
    });
  }

  // --- Create disposable (no git) ---
  const disposableName = `cander-prod-probe-${Date.now().toString(36)}`;
  let disposableId: string | null = null;
  {
    const path = "/v11/projects";
    const res = await vercelFetch(path, {
      method: "POST",
      body: JSON.stringify({
        name: disposableName,
        framework: "nextjs",
      }),
    });
    const err = res.ok ? null : await readVercelError(res);
    if (res.ok) {
      const body = (await res.json()) as { id?: string };
      disposableId = body.id || null;
    }
    steps.push({
      step: "create_disposable",
      method: "POST",
      path,
      teamIdPresent: Boolean(teamId),
      status: res.status,
      vercelErrorCode: err?.code,
      vercelErrorAction: err?.action,
      vercelErrorResource: err?.resource,
      vercelErrorMessage: err?.message,
      projectId: disposableId,
    });
    console.info("[cander:vercel-probe]", {
      step: "create_disposable",
      status: res.status,
      projectId: disposableId,
      errorCode: err?.code,
      errorAction: err?.action,
      errorResource: err?.resource,
      errorMessage: err?.message,
    });

    if (
      res.status === 403 &&
      err?.action === "create" &&
      err?.resource === "project"
    ) {
      return {
        ok: false,
        stoppedReason: "create_forbidden",
        teamIdConfigured,
        platformProjectIdConfigured,
        tokenConfigured,
        steps,
        disposableProjectId: null,
      };
    }

    if (!res.ok || !disposableId) {
      return {
        ok: false,
        stoppedReason: "create_failed",
        teamIdConfigured,
        platformProjectIdConfigured,
        tokenConfigured,
        steps,
        disposableProjectId: null,
      };
    }
  }

  // Delete disposable
  {
    const path = `/v9/projects/${encodeURIComponent(disposableId)}`;
    const res = await vercelFetch(path, { method: "DELETE" });
    const err = res.ok ? null : await readVercelError(res);
    steps.push({
      step: "delete_disposable",
      method: "DELETE",
      path: "/v9/projects/:id",
      teamIdPresent: Boolean(teamId),
      status: res.status,
      vercelErrorCode: err?.code,
      vercelErrorAction: err?.action,
      vercelErrorResource: err?.resource,
      vercelErrorMessage: err?.message,
      projectId: disposableId,
    });
    console.info("[cander:vercel-probe]", {
      step: "delete_disposable",
      status: res.status,
      projectId: disposableId,
      errorCode: err?.code,
    });
  }

  // --- Option B: git-linked project, disable auto-deploy, one Deploy API ---
  const optionBRepo =
    opts?.optionBRepo || "Warix-AI/cander-049586e3a926452180eb399d";
  const optionBRepoId = opts?.optionBRepoId ?? 1363267134;
  const optionBSha =
    opts?.optionBSha || "158082a0390e564dd845428d2497f957851a0066";
  const optionBRef = opts?.optionBRef || "cander/draft";
  const optionBName = `cander-prod-ob-${Date.now().toString(36)}`;
  let optionBProjectId: string | null = null;

  {
    const path = "/v11/projects";
    const res = await vercelFetch(path, {
      method: "POST",
      body: JSON.stringify({
        name: optionBName,
        framework: "nextjs",
        gitRepository: {
          type: "github",
          repo: optionBRepo,
        },
      }),
    });
    const err = res.ok ? null : await readVercelError(res);
    if (res.ok) {
      const body = (await res.json()) as { id?: string };
      optionBProjectId = body.id || null;
    }
    steps.push({
      step: "option_b_create_with_git",
      method: "POST",
      path,
      teamIdPresent: Boolean(teamId),
      status: res.status,
      vercelErrorCode: err?.code,
      vercelErrorAction: err?.action,
      vercelErrorResource: err?.resource,
      vercelErrorMessage: err?.message,
      projectId: optionBProjectId,
    });
    console.info("[cander:vercel-probe]", {
      step: "option_b_create_with_git",
      status: res.status,
      projectId: optionBProjectId,
      errorCode: err?.code,
      errorAction: err?.action,
      errorResource: err?.resource,
    });

    if (!res.ok || !optionBProjectId) {
      // Fallback: create without git for Deploy API-only Option B
      const res2 = await vercelFetch(path, {
        method: "POST",
        body: JSON.stringify({
          name: `${optionBName}-nogit`,
          framework: "nextjs",
        }),
      });
      const err2 = res2.ok ? null : await readVercelError(res2);
      if (res2.ok) {
        const body = (await res2.json()) as { id?: string };
        optionBProjectId = body.id || null;
      }
      steps.push({
        step: "option_b_create_without_git_fallback",
        method: "POST",
        path,
        teamIdPresent: Boolean(teamId),
        status: res2.status,
        vercelErrorCode: err2?.code,
        vercelErrorAction: err2?.action,
        vercelErrorResource: err2?.resource,
        vercelErrorMessage: err2?.message,
        projectId: optionBProjectId,
      });
      if (!res2.ok || !optionBProjectId) {
        return {
          ok: false,
          stoppedReason: "option_b_failed",
          teamIdConfigured,
          platformProjectIdConfigured,
          tokenConfigured,
          steps,
          disposableProjectId: disposableId,
          optionBProjectId: null,
        };
      }
    }
  }

  // Disable git auto-deploy
  {
    const path = `/v9/projects/${encodeURIComponent(optionBProjectId)}`;
    const res = await vercelFetch(path, {
      method: "PATCH",
      body: JSON.stringify({
        gitProviderOptions: { createDeployments: "disabled" },
        commandForIgnoringBuildStep: "exit 0",
      }),
    });
    const err = res.ok ? null : await readVercelError(res);
    steps.push({
      step: "option_b_disable_git_autodeploy",
      method: "PATCH",
      path: "/v9/projects/:id",
      teamIdPresent: Boolean(teamId),
      status: res.status,
      vercelErrorCode: err?.code,
      vercelErrorAction: err?.action,
      vercelErrorResource: err?.resource,
      vercelErrorMessage: err?.message,
      projectId: optionBProjectId,
    });
    console.info("[cander:vercel-probe]", {
      step: "option_b_disable_git_autodeploy",
      status: res.status,
      projectId: optionBProjectId,
      errorCode: err?.code,
    });
  }

  // Settle any link-triggered deploy, then baseline
  await new Promise((r) => setTimeout(r, 5000));
  const before = await countProductionDeployments(optionBProjectId);
  steps.push({
    step: "option_b_count_before",
    method: "GET",
    path: "/v6/deployments",
    teamIdPresent: Boolean(teamId),
    status: before.status,
    projectId: optionBProjectId,
    projectCount: before.count,
    vercelErrorCode: before.error ?? null,
  });

  // Single Deploy API production create
  let deploymentId: string | null = null;
  {
    const path = "/v13/deployments";
    const res = await vercelFetch(path, {
      method: "POST",
      body: JSON.stringify({
        name: optionBName,
        project: optionBProjectId,
        target: "production",
        gitSource: {
          type: "github",
          repoId: optionBRepoId,
          ref: optionBRef,
          sha: optionBSha,
        },
        meta: { canderProbe: "option-b" },
      }),
    });
    const err = res.ok ? null : await readVercelError(res);
    if (res.ok) {
      const body = (await res.json()) as { id?: string };
      deploymentId = body.id || null;
    }
    steps.push({
      step: "option_b_deploy_api",
      method: "POST",
      path,
      teamIdPresent: Boolean(teamId),
      status: res.status,
      vercelErrorCode: err?.code,
      vercelErrorAction: err?.action,
      vercelErrorResource: err?.resource,
      vercelErrorMessage: err?.message,
      projectId: optionBProjectId,
      deploymentId,
    });
    console.info("[cander:vercel-probe]", {
      step: "option_b_deploy_api",
      status: res.status,
      projectId: optionBProjectId,
      deploymentId,
      errorCode: err?.code,
      errorMessage: err?.message,
    });
  }

  await new Promise((r) => setTimeout(r, 3000));
  const after = await countProductionDeployments(optionBProjectId);
  const delta =
    before.count >= 0 && after.count >= 0 ? after.count - before.count : -1;
  steps.push({
    step: "option_b_count_after",
    method: "GET",
    path: "/v6/deployments",
    teamIdPresent: Boolean(teamId),
    status: after.status,
    projectId: optionBProjectId,
    projectCount: after.count,
    delta,
    deploymentId,
    vercelErrorCode: after.error ?? null,
  });

  // Cleanup Option B project
  {
    const path = `/v9/projects/${encodeURIComponent(optionBProjectId)}`;
    const res = await vercelFetch(path, { method: "DELETE" });
    const err = res.ok ? null : await readVercelError(res);
    steps.push({
      step: "option_b_cleanup",
      method: "DELETE",
      path: "/v9/projects/:id",
      teamIdPresent: Boolean(teamId),
      status: res.status,
      vercelErrorCode: err?.code,
      projectId: optionBProjectId,
    });
    console.info("[cander:vercel-probe]", {
      step: "option_b_cleanup",
      status: res.status,
      projectId: optionBProjectId,
    });
  }

  const optionBOk = Boolean(deploymentId) && delta === 1;
  return {
    ok: optionBOk,
    stoppedReason: optionBOk ? "passed" : "option_b_failed",
    teamIdConfigured,
    platformProjectIdConfigured,
    tokenConfigured,
    steps,
    disposableProjectId: disposableId,
    optionBProjectId,
  };
}
