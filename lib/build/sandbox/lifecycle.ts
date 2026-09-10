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
import { projectPreviewPath } from "@/lib/build/preview/urls";
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
  projectId: string;
  status: BuildSandboxStatus;
  sessionId: string | null;
  subdomain: string | null;
  draftBranch: string | null;
  draftSha: string | null;
  githubFullName: string | null;
  /** Never send raw upstream to browser — server-only. */
  hasPreviewUpstream: boolean;
  /** Same-origin path proxy for the Build iframe. */
  previewPath: string | null;
  /** Friendly draft host when subdomain is allocated. */
  previewHost: string | null;
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
  partial: Omit<
    EnsureProjectSandboxResult,
    "hasPreviewUpstream" | "previewPath" | "previewHost"
  > & {
    previewUpstream?: string | null;
    workspaceId: string;
  },
): EnsureProjectSandboxResult {
  const { previewUpstream, workspaceId, ...rest } = partial;
  const hasPreviewUpstream = Boolean(previewUpstream);
  // Never hand the iframe a proxy URL until something is listening on APP_PORT.
  // Stale stream_url alone caused SANDBOX_NOT_LISTENING 502s in the canvas.
  const previewPath =
    rest.status === "ready" && rest.sessionId && hasPreviewUpstream
      ? projectPreviewPath(rest.projectId, workspaceId)
      : null;
  return {
    ...rest,
    hasPreviewUpstream,
    previewPath,
    previewHost: rest.subdomain ? `draft--${rest.subdomain}.cander.app` : null,
  };
}

async function persistPreviewUpstream(opts: {
  sessionId: string;
  previewUpstream: string | null;
  status: BuildSandboxStatus;
  message: string;
  githubFullName?: string;
  draftBranch?: string;
  draftSha?: string | null;
}) {
  const row = await getComputerSessionRowById(opts.sessionId);
  const prev = (row?.build_state ?? null) as BuildSandboxState | null;
  const state: BuildSandboxState = {
    purpose: BUILD_SANDBOX_PURPOSE,
    status: opts.status,
    githubFullName: opts.githubFullName ?? prev?.githubFullName,
    draftBranch: opts.draftBranch ?? prev?.draftBranch,
    draftSha: opts.draftSha ?? prev?.draftSha ?? undefined,
    previewUpstream: opts.previewUpstream,
    message: opts.message,
    updatedAt: nowIso(),
  };
  await writeBuildState(opts.sessionId, state);
  await updateComputerSession(opts.sessionId, {
    stream_url: opts.previewUpstream,
    status:
      opts.status === "ready"
        ? "active"
        : opts.status === "starting"
          ? "starting"
          : opts.status === "error"
            ? "error"
            : "idle",
  });
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
        // Prefer exact tip SHA when known so compile preflight / preview
        // land on the same commit Publish will deploy.
        revision: opts.draftSha || opts.draftBranch,
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

    // Git source clones into a repo-named subdirectory — flatten to cwd.
    // Use find -exec mv (works under dash/bash) so `.git` is not left behind.
    try {
      await sandbox.runCommand({
        cmd: "sh",
        args: [
          "-c",
          `set -eu
if [ ! -d .git ]; then
  git_dir=$(find . -maxdepth 2 -type d -name .git 2>/dev/null | head -1 || true)
  if [ -n "$git_dir" ]; then
    d=$(dirname "$git_dir")
    if [ -n "$d" ] && [ "$d" != "." ]; then
      find "$d" -mindepth 1 -maxdepth 1 -exec mv {} . \\;
      rmdir "$d" 2>/dev/null || rm -rf "$d"
    fi
  fi
fi
if [ ! -d .git ]; then
  echo "FLATTEN_FAILED no .git at cwd" >&2
  find . -maxdepth 2 -type d -name .git -print >&2 || true
  ls -la >&2 || true
  exit 1
fi
echo FLATTEN_OK
ls -la
git rev-parse --short HEAD`,
        ],
      });
    } catch (err) {
      console.warn("[cander] flatten git clone", err);
    }

    let previewUpstream: string | null = null;
    try {
      previewUpstream = sandbox.domain(BUILD_APP_PORT);
    } catch {
      previewUpstream = null;
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

    // If app already has a ready Supabase binding, re-inject env (secrets never in git).
    try {
      const { loadAppSupabaseBinding } = await import(
        "@/lib/build/supabase/provision"
      );
      const binding = await loadAppSupabaseBinding(
        opts.projectId,
        opts.workspaceId,
      );
      if (binding?.kind !== "site" && binding?.status === "ready" && binding.ref) {
        const { injectAppSupabaseIntoSandbox } = await import(
          "@/lib/build/supabase/inject"
        );
        await injectAppSupabaseIntoSandbox({
          userId: opts.userId,
          projectId: opts.projectId,
          workspaceId: opts.workspaceId,
          sessionId,
        });
      }
    } catch (err) {
      console.warn("[cander] supabase inject on sandbox create skipped", err);
    }

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
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
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
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
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
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
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
    // SHA pin: stale sandbox tip cannot be reused as "ready".
    const existingRow = await getComputerSessionRowById(existing.id);
    const sandboxSha =
      existingRow?.build_state &&
      typeof existingRow.build_state === "object"
        ? String(
            (existingRow.build_state as { draftSha?: string }).draftSha || "",
          )
        : "";
    const tipSha = draftSha || "";
    const {
      sandboxMatchesProjectTip,
    } = await import("@/lib/build/build-phase");
    if (
      tipSha &&
      sandboxSha &&
      !sandboxMatchesProjectTip({
        sandboxDraftSha: sandboxSha,
        projectDraftSha: tipSha,
      })
    ) {
      console.info("[cander:sandbox] tip SHA mismatch; recreating", {
        projectId: opts.projectId,
        sandboxSha: sandboxSha.slice(0, 12),
        tipSha: tipSha.slice(0, 12),
      });
      try {
        await stopSessionRecordById(existing.id, existing.userId);
      } catch {
        await updateComputerSession(existing.id, { status: "stopped" });
      }
      // Fall through to createBuildSandboxFromGit.
    } else {
      const resumed = await tryResumeBuildSession(existing);
      if (resumed.ok) {
        try {
          const { loadAppSupabaseBinding } = await import(
            "@/lib/build/supabase/provision"
          );
          const binding = await loadAppSupabaseBinding(
            opts.projectId,
            opts.workspaceId,
          );
          if (binding?.kind !== "site" && binding?.status === "ready" && binding.ref) {
            const { injectAppSupabaseIntoSandbox } = await import(
              "@/lib/build/supabase/inject"
            );
            await injectAppSupabaseIntoSandbox({
              userId: opts.userId,
              projectId: opts.projectId,
              workspaceId: opts.workspaceId,
              sessionId: existing.id,
            });
          }
        } catch (err) {
          console.warn("[cander] supabase inject on resume skipped", err);
        }

        let message = "Starting preview…";
        let previewUpstream = resumed.previewUpstream;
        let status: BuildSandboxStatus = "starting";
        let recreateFromGit = false;

        try {
          const { ensureSandboxDevServer } = await import(
            "@/lib/build/preview/dev-server"
          );
          const dev = await ensureSandboxDevServer({
            sessionId: existing.id,
            userId: opts.userId,
          });
          if (dev.ready) {
            status = "ready";
            message = dev.message || "Environment ready";
            if (!previewUpstream) {
              try {
                const { resolveSandboxForSession } = await import(
                  "@/lib/computer/session-runtime"
                );
                const resolved = await resolveSandboxForSession(
                  existing.id,
                  opts.userId,
                );
                previewUpstream = resolved?.sandbox.domain(BUILD_APP_PORT) ?? null;
              } catch {
                /* keep prior */
              }
            }
          } else if (draftSha && /No package\.json/i.test(dev.message || "")) {
            recreateFromGit = true;
          } else {
            message = dev.message || "Starting preview…";
            previewUpstream = null;
          }
        } catch (err) {
          console.warn("[cander] dev server on resume", err);
          message =
            err instanceof Error
              ? `Sandbox resumed; preview start failed: ${err.message}`
              : "Sandbox resumed; preview start failed.";
          previewUpstream = null;
          status = "error";
        }

        if (recreateFromGit) {
          try {
            await stopSessionRecordById(existing.id, existing.userId);
          } catch {
            await updateComputerSession(existing.id, { status: "stopped" });
          }
          await patchProjectSandbox(opts.projectId, opts.workspaceId, {
            sandbox_session_id: null,
            sandbox_status: "idle",
          });
          // Fall through to createBuildSandboxFromGit.
        } else {
          await persistPreviewUpstream({
            sessionId: existing.id,
            previewUpstream,
            status,
            message,
            githubFullName: fullName,
            draftBranch,
            draftSha,
          });
          await patchProjectSandbox(opts.projectId, opts.workspaceId, {
            sandbox_session_id: existing.id,
            sandbox_status: status,
          });
          return publicResult({
            projectId: opts.projectId,
            workspaceId: opts.workspaceId,
            status,
            sessionId: existing.id,
            subdomain: infra.subdomain,
            draftBranch,
            draftSha,
            githubFullName: fullName,
            previewUpstream,
            reused: true,
            message,
          });
        }
      } else {
        // Resume failed — GC stale sandbox before recreate.
        try {
          await stopSessionRecordById(existing.id, existing.userId);
        } catch {
          await updateComputerSession(existing.id, { status: "stopped" });
        }
        await patchProjectSandbox(opts.projectId, opts.workspaceId, {
          sandbox_session_id: null,
          sandbox_status: "idle",
        });
      }
    } // end SHA-match else (resume path)
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
    let message = "Starting preview…";
    let previewUpstream = created.previewUpstream;
    let status: BuildSandboxStatus = "starting";
    try {
      const { ensureSandboxDevServer } = await import(
        "@/lib/build/preview/dev-server"
      );
      const dev = await ensureSandboxDevServer({
        sessionId: created.session.id,
        userId: opts.userId,
      });
      if (dev.ready) {
        status = "ready";
        message = dev.message || "Environment ready";
        if (!previewUpstream) {
          previewUpstream = created.previewUpstream;
        }
      } else {
        message = dev.message || "Starting preview…";
        previewUpstream = null;
      }
    } catch (err) {
      console.warn("[cander] dev server on create", err);
      message =
        err instanceof Error
          ? `Sandbox ready; preview start failed: ${err.message}`
          : "Sandbox ready; preview start failed.";
      previewUpstream = null;
      status = "error";
    }
    await persistPreviewUpstream({
      sessionId: created.session.id,
      previewUpstream,
      status,
      message,
      githubFullName: fullName,
      draftBranch,
      draftSha,
    });
    await patchProjectSandbox(opts.projectId, opts.workspaceId, {
      sandbox_session_id: created.session.id,
      sandbox_status: status,
    });
    return publicResult({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      status,
      sessionId: created.session.id,
      subdomain: infra.subdomain,
      draftBranch,
      draftSha,
      githubFullName: fullName,
      previewUpstream,
      reused: false,
      message,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return publicResult({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
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
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
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

    // Promote "starting" → ready when the app port is already listening
    // (common after ensure timed out waiting on npm install).
    if (
      row?.user_id &&
      (status === "starting" || (status === "ready" && !previewUpstream))
    ) {
      try {
        const { runPrivilegedSandboxCommand } = await import(
          "@/lib/build/sandbox/privileged"
        );
        const probe = await runPrivilegedSandboxCommand({
          sessionId,
          userId: String(row.user_id),
          cmd: "sh",
          args: [
            "-c",
            [
              `code=$(curl -sS -o /tmp/cander_preview_probe.html -w "%{http_code}" --max-time 3 http://127.0.0.1:${BUILD_APP_PORT}/ 2>/dev/null || echo 000)`,
              `body=$(head -c 8000 /tmp/cander_preview_probe.html 2>/dev/null || true)`,
              `if echo "$code" | grep -Eq '^[45]'; then echo "FAIL $code"; exit 0; fi`,
              `if echo "$body" | grep -Eqi '__next_error|Application error'; then echo "FAIL next_error $code"; exit 0; fi`,
              `if echo "$code" | grep -Eq '^[123]'; then echo "OK $code"; exit 0; fi`,
              `echo "WAIT $code"`,
            ].join("; "),
          ],
        });
        const out = (probe.stdout || "").trim();
        const codeMatch = out.match(/\b(\d{3})\b/);
        const code = codeMatch?.[1] || "";
        if (/^FAIL\b/.test(out)) {
          status = "error";
          message = out.includes("next_error")
            ? "Draft failed to start (Next.js runtime error)."
            : `Draft failed to start (HTTP ${code || "error"}).`;
          await persistPreviewUpstream({
            sessionId,
            previewUpstream,
            status,
            message,
            githubFullName: project.github_full_name
              ? String(project.github_full_name)
              : undefined,
            draftBranch: project.draft_branch
              ? String(project.draft_branch)
              : undefined,
            draftSha: project.draft_sha ? String(project.draft_sha) : null,
          });
          await patchProjectSandbox(opts.projectId, opts.workspaceId, {
            sandbox_session_id: sessionId,
            sandbox_status: "error",
          });
        } else if (/^OK\b/.test(out) && /^[1-3]\d\d$/.test(code)) {
          if (!previewUpstream) {
            try {
              const session = await getComputerSessionById(
                sessionId,
                String(row.user_id),
              );
              if (session) {
                const resumed = await tryResumeBuildSession(session);
                if (resumed.ok) previewUpstream = resumed.previewUpstream;
              }
            } catch {
              /* keep */
            }
          }
          status = "ready";
          message = "Environment ready";
          await persistPreviewUpstream({
            sessionId,
            previewUpstream,
            status,
            message,
            githubFullName: project.github_full_name
              ? String(project.github_full_name)
              : undefined,
            draftBranch: project.draft_branch
              ? String(project.draft_branch)
              : undefined,
            draftSha: project.draft_sha ? String(project.draft_sha) : null,
          });
          await patchProjectSandbox(opts.projectId, opts.workspaceId, {
            sandbox_session_id: sessionId,
            sandbox_status: "ready",
          });
        }
      } catch (err) {
        console.warn("[cander] sandbox status probe", err);
      }
    }
  } else if (!project.github_full_name) {
    status = "needs_repo";
  }

  return publicResult({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
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
