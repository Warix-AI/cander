/**
 * Cander infrastructure façade — the deterministic, idempotent service layer
 * the agent runtime and API routes call. Every function takes a project scope
 * (never provider ids from the client), reuses existing provider resources,
 * persists provider ids as soon as they exist, and is safe to call repeatedly.
 *
 *   ensureGitHubRepository   one repo per project (main + cander/draft)
 *   ensureSupabaseProject    one backend per app project, lazily
 *   ensureVercelProject      one Vercel project per project
 *   ensureProjectSandbox     one live VM per project (resume → recreate)
 *   ensurePreview            dev server up and healthy in that VM
 *   syncProjectEnvironment   env vars → sandbox (and Vercel, Phase 3)
 *   publishProject           exactly one production deployment per operation
 *   recoverProject           bounded, escalating preview/sandbox repair
 *
 * These wrap the existing implementations; the wrapped modules remain the
 * place where behaviour lives.
 */

import type { ProjectRuntimeResult } from "@/lib/build/sandbox/runtime";

export type ProjectScope = { projectId: string; workspaceId: string };
export type UserProjectScope = ProjectScope & { userId: string };

export async function ensureGitHubRepository(scope: ProjectScope) {
  const { ensureProjectInfra } = await import("@/lib/build/ensure-project-infra");
  return ensureProjectInfra({ projectId: scope.projectId, workspaceId: scope.workspaceId });
}

export async function ensureSupabaseProject(scope: ProjectScope & { includeSecrets?: boolean }) {
  const { ensureAppSupabaseProject } = await import("@/lib/build/supabase/provision");
  return ensureAppSupabaseProject(scope);
}

export async function ensureVercelProject(scope: ProjectScope) {
  const { ensureAppVercelProject } = await import("@/lib/build/vercel/projects");
  return ensureAppVercelProject(scope);
}

/** Reuse the active sandbox, resume a suspended one, recreate only if dead. */
export async function ensureProjectSandbox(scope: UserProjectScope): Promise<ProjectRuntimeResult> {
  const { connectProjectRuntime } = await import("@/lib/build/sandbox/runtime");
  return connectProjectRuntime(scope);
}

/**
 * Dev server reachable inside the project's sandbox. Connect first; if the
 * app port does not answer, run the escalating repair (restart → reinstall →
 * recreate). Never creates a second VM for the project.
 */
export async function ensurePreview(scope: UserProjectScope): Promise<ProjectRuntimeResult> {
  const { connectProjectRuntime, repairProjectRuntime } = await import("@/lib/build/sandbox/runtime");
  const connected = await connectProjectRuntime(scope);
  if (connected.state === "ready" && connected.hasPreviewUpstream) return connected;
  if (connected.status === "unavailable" || connected.status === "needs_repo") return connected;
  return repairProjectRuntime(scope);
}

/**
 * Push the project's environment into the sandbox. Today: Supabase keys for
 * app projects (when a backend exists). Phase 3/4 extend this to the vault +
 * Vercel with drift detection. Never logs values.
 */
export async function syncProjectEnvironment(scope: UserProjectScope & { sessionId?: string | null }) {
  const sessionId = scope.sessionId ?? (await ensureProjectSandbox(scope)).sessionId;
  if (!sessionId) return { ok: false as const, reason: "no_sandbox" as const };
  const { injectAppSupabaseIntoSandbox } = await import("@/lib/build/supabase/inject");
  const result = await injectAppSupabaseIntoSandbox({ ...scope, sessionId });
  return { ok: true as const, supabase: result };
}

/** One click → one deployment. `operationId` is the publish idempotency handle. */
export async function publishProject(scope: UserProjectScope & { operationId?: string | null; preferredUrl?: string | null }) {
  const { publishProject: run } = await import("@/lib/build/publish/publish-project");
  return run({
    userId: scope.userId,
    projectId: scope.projectId,
    workspaceId: scope.workspaceId,
    preferredUrl: scope.preferredUrl ?? null,
    publishAttemptId: scope.operationId ?? null,
  });
}

/** Bounded, escalating recovery of the preview/sandbox. Never touches production. */
export async function recoverProject(scope: UserProjectScope): Promise<ProjectRuntimeResult> {
  const { repairProjectRuntime } = await import("@/lib/build/sandbox/runtime");
  return repairProjectRuntime(scope);
}
