/**
 * Project build sandbox lifecycle — disposable Vercel Sandbox cloned from GitHub draft.
 * Server-only. Callers must assertProjectAccess first.
 */

import { Sandbox } from "@vercel/sandbox";
import { getSandboxCredentials } from "@agent-browser/sandbox/vercel";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isGitHubAppConfigured, isVercelTeamConfigured } from "@/lib/build/config";
import { ensureProjectInfra } from "@/lib/build/ensure-project-infra";
import { getGitHubInstallationToken } from "@/lib/build/git/installation-token";
import {
  BUILD_APP_PORT,
  BUILD_SANDBOX_PURPOSE,
  BUILD_SANDBOX_TTL_MS,
  type BuildSandboxState,
  type BuildSandboxStatus,
} from "@/lib/build/sandbox/constants";
import type { AgentBrowserSandbox } from "@/lib/computer/spike/agent-browser-bootstrap";
import type { ComputerSessionRecord } from "@/lib/computer/computer-provider";
import {
  cacheSandboxHandle,
  createComputerSessionId,
  resumeSandbox,
  stopSessionRecordById,
} from "@/lib/computer/session-runtime";
import {
  findActiveSessionByScope,
  getComputerSessionById,
  getComputerSessionRowById,
  insertComputerSession,
  updateComputerSession,
} from "@/lib/computer/session-store";

export type EnsureProjectSandboxResult = {
  status: BuildSandboxStatus;
  sessionId: string | null;
  subdomain: string | null;
  draftBranch: string | null;
  draftSha: string | null;
  githubFullName: string | null;
  /** Never send raw upstream to browser in Phase 2 — kept for server/logs. */
  hasPreviewUpstream: boolean;
  message?: string;
  reused: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

async function patchProjectSandbox(
  projectId: string,
  workspaceId: string,
  patch: {
    sandbox_session_id?: string | null;
    sandbox_status?: string | null;
  },
) {
  const admin = createSupabaseAdminClient();
  await admin
    .from("projects")
    .update({ ...patch, updated_at: nowIso() })
    .eq("id", projectId)
    .eq("workspace_id", workspaceId);
}

async function writeBuildState(
  sessionId: string,
  state: BuildSandboxState,
): Promise<void> {
  await updateComputerSession(sessionId, {
    build_state: state,
    status:
      state.status === "ready"
        ? "active"
        : state.status === "starting"
          ? "starting"
          : state.status === "error"
            ? "error"
            : "idle",
  });
}

function publicResult(
  partial: Omit<EnsureProjectSandboxResult, "hasPreviewUpstream"> & {
    previewUpstream?: string | null;
  },
): EnsureProjectSandboxResult {
  const { previewUpstream: _drop, ...rest } = partial;
  return {
    ...rest,
    hasPreviewUpstream: Boolean(partial.previewUpstream),
  };
}

async function tryResumeBuildSession(
  session: ComputerSessionRecord,
): Promise<{
  ok: true;
  previewUpstream: string | null;
  state: BuildSandboxState | null;
} | { ok: false }> {
  try {
    const sandbox = await resumeSandbox(session);
    cacheSandboxHandle(session.id, sandbox);
    let previewUpstream: string | null = null;
    try {
      previewUpstream = sandbox.domain(BUILD_APP_PORT);
    } catch {
      previewUpstream = null;
    }
    const row = await getComputerSessionRowById(session.id);
    const prev = (row?.build_state ?? null) as BuildSandboxState | null;
    const state: BuildSandboxState = {
      purpose: BUILD_SANDBOX_PURPOSE,
      status: "ready",
      githubFullName: prev?.githubFullName,
      draftBranch: prev?.draftBranch,
      draftSha: prev?.draftSha,
      previewUpstream: previewUpstream ?? prev?.previewUpstream ?? null,
      message: "Environment resumed",
      updatedAt: nowIso(),
    };
    await writeBuildState(session.id, state);
    await updateComputerSession(session.id, {
      expires_at: new Date(Date.now() + BUILD_SANDBOX_TTL_MS).toISOString(),
      stream_url: previewUpstream,
    });
    return { ok: true, previewUpstream, state };
  } catch {
    await updateComputerSession(session.id, { status: "error" });
    return { ok: false };
  }
}

async function createBuildSandboxFromGit(opts: {
  userId: string;
  projectId: string;
  workspaceId: string;
  scopeId: string;
  fullName: string;
  draftBranch: string;
  draftSha: string | null;
}): Promise<{
  session: ComputerSessionRecord;
  previewUpstream: string | null;
}> {
  const sessionId = createComputerSessionId();
  const token = await getGitHubInstallationToken();
  const cloneUrl = `https://github.com/${opts.fullName}.git`;

  const startingState: BuildSandboxState = {
    purpose: BUILD_SANDBOX_PURPOSE,
    status: "starting",
    githubFullName: opts.fullName,
    draftBranch: opts.draftBranch,
    draftSha: opts.draftSha ?? undefined,
    previewUpstream: null,
    message: "Cloning repository…",
    updatedAt: nowIso(),
  };

  const session = await insertComputerSession({
    id: sessionId,
    user_id: opts.userId,
    scope_type: "project",
    scope_id: opts.scopeId,
    chat_id: null,
    project_id: opts.projectId,
    workspace_id: opts.workspaceId,
    task_id: null,
    provider: "vercel_sandbox",
    provider_session_id: sessionId,
    status: "starting",
    control_mode: "agent",
    current_url: null,
    stream_url: null,
    browser_state: null,
    build_state: startingState,
    expires_at: new Date(Date.now() + BUILD_SANDBOX_TTL_MS).toISOString(),
  });

  await patchProjectSandbox(opts.projectId, opts.workspaceId, {
    sandbox_session_id: sessionId,
    sandbox_status: "starting",
  });

  try {
    const creds = getSandboxCredentials();
    const sandbox = (await Sandbox.create({
      ...creds,
      name: sessionId,
      source: {
        type: "git",
        url: cloneUrl,
        username: "x-access-token",
        password: token,
        depth: 1,
        revision: opts.draftBranch,
      },
      ports: [BUILD_APP_PORT],
      timeout: BUILD_SANDBOX_TTL_MS,
      tags: {
        purpose: "build",
        // Vercel tag values are short; use truncated ids
        project: opts.projectId.replace(/-/g, "").slice(0, 24),
      },
    })) as unknown as AgentBrowserSandbox;

    cacheSandboxHandle(sessionId, sandbox);

    let previewUpstream: string | null = null;
    try {
      previewUpstream = sandbox.domain(BUILD_APP_PORT);
    } catch {
      previewUpstream = null;
    }

    // Confirm tree exists (git clone root).
    try {
      await sandbox.runCommand({
        cmd: "sh",
        args: ["-c", "ls -la && git rev-parse --short HEAD || true"],
      });
    } catch {
      /* non-fatal */
    }

    const readyState: BuildSandboxState = {
      purpose: BUILD_SANDBOX_PURPOSE,
      status: "ready",
      githubFullName: opts.fullName,
      draftBranch: opts.draftBranch,
      draftSha: opts.draftSha ?? undefined,
      previewUpstream,
      message: "Environment ready",
      updatedAt: nowIso(),
    };
    await writeBuildState(sessionId, readyState);
    await updateComputerSession(sessionId, {
      status: "active",
      stream_url: previewUpstream,
      provider_session_id: sessionId,
    });
    await patchProjectSandbox(opts.projectId, opts.workspaceId, {
      sandbox_session_id: sessionId,
      sandbox_status: "ready",
    });

    return {
      session: (await getComputerSessionById(sessionId, opts.userId)) ?? session,
      previewUpstream,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeBuildState(sessionId, {
      purpose: BUILD_SANDBOX_PURPOSE,
      status: "error",
      githubFullName: opts.fullName,
      draftBranch: opts.draftBranch,
      draftSha: opts.draftSha ?? undefined,
      previewUpstream: null,
      message,
      updatedAt: nowIso(),
    });
    await patchProjectSandbox(opts.projectId, opts.workspaceId, {
      sandbox_session_id: sessionId,
      sandbox_status: "error",
    });
    throw err;
  }
}

/**
 * Ensure one active build sandbox for the project, cloned from GitHub draft tip.
 * Idempotent: resumes when possible; recreates from git when dead.
 */
export async function ensureProjectSandbox(opts: {
  userId: string;
  projectId: string;
  workspaceId: string;
  /** Force destroy + recreate from git */
  forceRestart?: boolean;
}): Promise<EnsureProjectSandboxResult> {
  if (!isVercelTeamConfigured()) {
    return publicResult({
      status: "unavailable",
      sessionId: null,
      subdomain: null,
      draftBranch: null,
      draftSha: null,
      githubFullName: null,
      reused: false,
      message:
        "Vercel Sandbox is not configured on this server (VERCEL_TOKEN / team).",
    });
  }

  const infra = await ensureProjectInfra({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
  });

  if (!infra.github.fullName && infra.github.skipped) {
    const status: BuildSandboxStatus =
      infra.github.reason === "github_not_configured" ||
      infra.github.reason === "github_ensure_failed"
        ? "needs_repo"
        : infra.github.reason === "not_a_build_project"
          ? "unavailable"
          : "needs_repo";
    return publicResult({
      status,
      sessionId: null,
      subdomain: infra.subdomain,
      draftBranch: null,
      draftSha: null,
      githubFullName: null,
      reused: false,
      message:
        status === "needs_repo"
          ? "GitHub repository is not ready yet. Infra will retry on the next open."
          : infra.github.reason,
    });
  }

  if (!isGitHubAppConfigured() || !infra.github.fullName) {
    return publicResult({
      status: "needs_repo",
      sessionId: null,
      subdomain: infra.subdomain,
      draftBranch: null,
      draftSha: null,
      githubFullName: null,
      reused: false,
      message: "GitHub App is not configured.",
    });
  }

  const fullName = infra.github.fullName;
  const draftBranch = infra.github.draftBranch ?? "cander/draft";
  const draftSha = infra.github.draftSha ?? null;

  const scopeId = `build:${opts.projectId}`;
  const existing = await findActiveSessionByScope(
    opts.userId,
    "project",
    scopeId,
  );
  const existingIsBuild =
    existing &&
    (await getComputerSessionRowById(existing.id))?.build_state?.purpose ===
      BUILD_SANDBOX_PURPOSE;

  if (existingIsBuild && existing && opts.forceRestart) {
    try {
      await stopSessionRecordById(existing.id, existing.userId);
    } catch {
      await updateComputerSession(existing.id, { status: "stopped" });
    }
  } else if (existingIsBuild && existing) {
    const resumed = await tryResumeBuildSession(existing);
    if (resumed.ok) {
      await patchProjectSandbox(opts.projectId, opts.workspaceId, {
        sandbox_session_id: existing.id,
        sandbox_status: "ready",
      });
      return publicResult({
        status: "ready",
        sessionId: existing.id,
        subdomain: infra.subdomain,
        draftBranch,
        draftSha,
        githubFullName: fullName,
        previewUpstream: resumed.previewUpstream,
        reused: true,
        message: "Environment resumed",
      });
    }
  }

  try {
    const created = await createBuildSandboxFromGit({
      userId: opts.userId,
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      scopeId,
      fullName,
      draftBranch,
      draftSha,
    });
    return publicResult({
      status: "ready",
      sessionId: created.session.id,
      subdomain: infra.subdomain,
      draftBranch,
      draftSha,
      githubFullName: fullName,
      previewUpstream: created.previewUpstream,
      reused: false,
      message: "Environment ready",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return publicResult({
      status: "error",
      sessionId: null,
      subdomain: infra.subdomain,
      draftBranch,
      draftSha,
      githubFullName: fullName,
      reused: false,
      message,
    });
  }
}

export async function getProjectSandboxStatus(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<EnsureProjectSandboxResult> {
  const admin = createSupabaseAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select(
      "cander_subdomain, sandbox_session_id, sandbox_status, github_full_name, draft_branch, draft_sha",
    )
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();

  if (!project) {
    return publicResult({
      status: "error",
      sessionId: null,
      subdomain: null,
      draftBranch: null,
      draftSha: null,
      githubFullName: null,
      reused: false,
      message: "Project not found.",
    });
  }

  const sessionId = project.sandbox_session_id
    ? String(project.sandbox_session_id)
    : null;
  let previewUpstream: string | null = null;
  let status = (project.sandbox_status as BuildSandboxStatus) || "idle";
  let message: string | undefined;

  if (sessionId) {
    const row = await getComputerSessionRowById(sessionId);
    if (row?.build_state && typeof row.build_state === "object") {
      const bs = row.build_state as BuildSandboxState;
      if (bs.status) status = bs.status;
      if (bs.message) message = bs.message;
      previewUpstream = bs.previewUpstream ?? null;
    }
    if (row?.status === "stopped" || row?.status === "error") {
      status = row.status === "error" ? "error" : "idle";
    }
  } else if (!project.github_full_name) {
    status = "needs_repo";
  }

  return publicResult({
    status,
    sessionId,
    subdomain: project.cander_subdomain
      ? String(project.cander_subdomain)
      : null,
    draftBranch: project.draft_branch ? String(project.draft_branch) : null,
    draftSha: project.draft_sha ? String(project.draft_sha) : null,
    githubFullName: project.github_full_name
      ? String(project.github_full_name)
      : null,
    previewUpstream,
    reused: true,
    message,
  });
}
