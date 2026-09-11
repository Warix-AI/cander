/**
 * Server orchestration for Website Builder V2 jobs.
 *
 *  start   → ensure boot skeleton on the draft tip → ensure sandbox → upload
 *            builder/ + config → start `node .cander/builder/index.mjs` detached
 *  sync    → pull new lines from .cander/jobs/<id>/events.jsonl (pull path;
 *            the builder also pushes when it can reach us) → mirror phase →
 *            on `finished`: persist ONE commit → finalizeBuildReady → ready
 *  fail    → mark job + build_phase failed
 *
 * The sandbox never holds secrets: LLM / 21st calls go through the job-token
 * proxy routes unless CANDER_BUILDER_TRANSPORT=direct (local dev only).
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveSandboxForSession } from "@/lib/computer/session-runtime";
import { runPrivilegedSandboxCommand } from "@/lib/build/sandbox/privileged";
import { ensureProjectSandbox } from "@/lib/build/sandbox/lifecycle";
import { persistSandboxToDraft } from "@/lib/build/sandbox/persist";
import {
  ensureBuildRun,
  finishBuildRun,
  recordRunToolCalls,
  runStatusFromEvents,
  setBuildRunStatus,
} from "@/lib/build/runs/records";
import { finalizeBuildReady } from "@/lib/build/preview/finalize-ready";
import { setProjectBuildPhase, type BuildPhase } from "@/lib/build/build-phase";
import { commitFilesToDraftBranch } from "@/lib/build/git/commit-draft";
import { inspectProjectDraftTip } from "@/lib/build/git/tip-inspect";
import {
  loadWebsiteSetupBrief,
  saveWebsiteSetupBrief,
} from "@/lib/build/website-setup-brief-store";
import {
  isOpenAIWebSearchEnabled,
  resolveOpenAICodingModel,
  resolveOpenAIModel,
} from "@/lib/ai/raw-openai/web-search";
import { isTwentyFirstConfigured } from "@/lib/ai/build/twenty-first-mcp";
import { BUILD_APP_PORT } from "@/lib/build/sandbox/constants";
import { signBuildJobToken } from "@/lib/build/jobs/token";
import { slugFromProjectName } from "@/lib/publish-domain";
import { appDirToUrlPath, hasRootPage } from "@/lib/ai/build/routes/app-router-conflicts";
import {
  appendBuildJobEvents,
  createBuildJob,
  findActiveBuildJob,
  findLatestBuildJob,
  findQueuedBuildJob,
  getBuildJob,
  listBuildJobEvents,
  transitionBuildJob,
  updateBuildJob,
  type BuildJob,
  type BuildJobEvent,
  type BuildJobFailure,
  type BuildJobFailureKind,
  type BuildJobResume,
  type BuildJobTransport,
} from "@/lib/build/jobs/store";
import { bootSkeletonFiles } from "@/lib/build/jobs/boot-skeleton";
import { loadPlanFirstArtifacts, savePlanFirstArtifacts } from "@/lib/ai/build/plan/store";
import {
  cleanBriefAnswers,
  mergeProjectSpecPatch,
  projectSpecFromSetupBrief,
  projectSpecRepoFiles,
} from "@/lib/ai/build/plan/spec-memory";
import type { ProjectSpec } from "@/lib/ai/build/plan/types";
import { signedProjectAssetUrl } from "@/lib/project-assets-server";
import { sanitizeUserProgress } from "@/lib/build/jobs/user-progress";

const LOG = "[cander:build-job]";
const BUILDER_DIR_IN_SANDBOX = ".cander/builder";
/** How long a job may keep its sandbox alive (Vercel Pro allows up to 5h). */
const JOB_SANDBOX_EXTEND_MS = 90 * 60 * 1000;
const CREATE_WALL_CLOCK_MS = 75 * 60 * 1000;
const EDIT_WALL_CLOCK_MS = 25 * 60 * 1000;
/** Consider the builder dead if the process is gone and no terminal event arrived. */
const STALL_GRACE_MS = 3 * 60 * 1000;
/** Fail even when the builder PID is still alive but emits nothing (hung next/dev, etc.). */
const EVENT_STALL_MS = 10 * 60 * 1000;
/** Completing (persist + preview) must not hang forever after the agent finished. */
const VERIFY_STALL_MS = 8 * 60 * 1000;
/**
 * A job claimed `running` but whose start never attached a sandbox session
 * (worker frozen/killed mid-start). Without a session nothing can be pulled,
 * so it would sit at "Preparing your workspace" forever.
 */
const START_STALL_MS = 5 * 60 * 1000;
/** Don't let finalizeBuildReady block the serverless worker indefinitely. */
const FINALIZE_READY_TIMEOUT_MS = 4 * 60 * 1000;

type BuilderSandbox = {
  runCommand(params: {
    cmd: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    detached?: boolean;
  }): Promise<unknown>;
  writeFiles(
    files: { path: string; content: string | Uint8Array; mode?: number }[],
  ): Promise<void>;
  extendTimeout?(durationMs: number): Promise<void>;
};

// ---------------------------------------------------------------------------
// Transport / public URL
// ---------------------------------------------------------------------------

function isLocalhostUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".local");
  } catch {
    return true;
  }
}

/** Public origin the sandbox can call back to (production deploy). */
export function resolveBuilderApiBase(): string | null {
  const candidates = [
    process.env.CANDER_BUILDER_CALLBACK_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  ];
  for (const c of candidates) {
    const v = c?.trim();
    if (!v) continue;
    const url = v.startsWith("http") ? v : `https://${v}`;
    if (isLocalhostUrl(url)) continue;
    try {
      return new URL(url).origin;
    } catch {
      continue;
    }
  }
  return null;
}

export function resolveBuilderTransport(): {
  transport: BuildJobTransport;
  apiBase: string | null;
} {
  const forced = process.env.CANDER_BUILDER_TRANSPORT?.trim().toLowerCase();
  const apiBase = resolveBuilderApiBase();
  if (forced === "direct") return { transport: "direct", apiBase };
  if (apiBase) return { transport: "proxy", apiBase };
  if (process.env.NODE_ENV !== "production") {
    return { transport: "direct", apiBase: null };
  }
  throw new Error(
    "Builder needs a public callback URL (NEXT_PUBLIC_APP_URL / CANDER_BUILDER_CALLBACK_URL) in production.",
  );
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function ensureBootSkeleton(
  job: BuildJob,
  title: string,
  kind: "site" | "app",
): Promise<{ paths: string[]; committed: boolean; draftSha: string | null }> {
  // Full tree — config files (tsconfig, postcss, .gitignore) must count as
  // present so a Retry never clobbers coder-tuned versions with the skeleton.
  const tip = await inspectProjectDraftTip({
    projectId: job.projectId,
    workspaceId: job.workspaceId,
    maxPaths: 2000,
    pathsMode: "all",
  });
  const have = new Set(tip.paths);
  const skeleton = bootSkeletonFiles({ title, kind });
  // Route-group aware: a home page at app/(marketing)/page.tsx counts, and we
  // must never add app/page.tsx next to it (two pages for "/").
  const rootPageOk = hasRootPage(tip.paths);
  const runnable =
    Boolean(tip.draftSha) &&
    have.has("package.json") &&
    have.has("app/layout.tsx") &&
    have.has("app/globals.css") &&
    rootPageOk;
  // Edit jobs work on an existing site: only touch the tip when it cannot
  // boot at all. Any commit here moves the tip and forces a sandbox rebuild.
  if (job.facts.mode === "edit" && runnable) {
    return { paths: tip.paths, committed: false, draftSha: tip.draftSha };
  }
  // Only fill gaps — never clobber existing work (or a retried create).
  const missing = skeleton.filter((f) => {
    if (have.has(f.path)) return false;
    if (/^app\/page\.tsx$/.test(f.path) && rootPageOk) return false;
    return true;
  });
  if (missing.length === 0) {
    return { paths: tip.paths, committed: false, draftSha: tip.draftSha };
  }
  const committed = await commitFilesToDraftBranch({
    projectId: job.projectId,
    workspaceId: job.workspaceId,
    message: "Cander: boot skeleton for website build",
    files: missing.map((f) => ({ path: f.path, content: f.content })),
  });
  return {
    paths: [...tip.paths, ...missing.map((f) => f.path)],
    committed: !committed.noop,
    draftSha: committed.draftSha || tip.draftSha,
  };
}

/**
 * "URL → file" map of the App Router pages at the tip, so the builder knows
 * the shape of the site before its first tool call (and never guesses which
 * file is the home page when it lives in a route group).
 */
function routeMapFromPaths(paths: string[]): string {
  const lines: string[] = [];
  for (const p of paths) {
    if (!/^app\/(.*\/)?page\.(tsx|jsx|ts|js|mdx)$/.test(p)) continue;
    const dir = p.replace(/\/?page\.(tsx|jsx|ts|js|mdx)$/, "").replace(/^app\/?/, "");
    lines.push(`${appDirToUrlPath(dir)} → ${p}`);
  }
  const layouts = paths.filter((p) => /^app\/(.*\/)?layout\.(tsx|jsx)$/.test(p));
  const components = paths.filter((p) => /^components\/.*\.(tsx|jsx)$/.test(p)).sort();
  const out: string[] = [];
  if (lines.length) out.push(lines.sort().join("\n"));
  if (layouts.length) out.push(`Layouts: ${layouts.join(", ")}`);
  if (components.length) {
    // Component index so edits go straight to the right file instead of
    // grepping the whole repo (shared UI first, then sections).
    const shown = components.slice(0, 80);
    out.push(
      `Components (${components.length}):\n${shown.join("\n")}${components.length > shown.length ? `\n… ${components.length - shown.length} more` : ""}`,
    );
  }
  const globals = paths.find((p) => /^app\/globals\.css$/.test(p));
  if (globals) out.push("Design tokens: app/globals.css");
  return out.join("\n");
}

async function readBuilderSources(): Promise<{ path: string; content: string }[]> {
  const dir = path.join(process.cwd(), "builder");
  const names = (await readdir(dir)).filter((n) => n.endsWith(".mjs"));
  const files = await Promise.all(
    names.map(async (n) => ({
      path: `${BUILDER_DIR_IN_SANDBOX}/${n}`,
      content: await readFile(path.join(dir, n), "utf8"),
    })),
  );
  if (!files.some((f) => f.path.endsWith("/index.mjs"))) {
    throw new Error("builder/index.mjs missing from deployment bundle");
  }
  return files;
}

export async function startBuildJob(job: BuildJob): Promise<BuildJob> {
  const userId = job.facts.userId;
  if (!userId) throw new Error("job has no userId");

  const admin = createSupabaseAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("title, kind, cander_subdomain, custom_domain, published_url, draft_sha")
    .eq("id", job.projectId)
    .maybeSingle();
  await ensureBuildRun(job, project?.draft_sha ? String(project.draft_sha) : null).catch(() => undefined);
  await setBuildRunStatus(job.id, job.facts.mode === "create" ? "planning" : "editing").catch(() => undefined);
  const projectName = String(project?.title ?? job.title ?? "New site");
  // The URL the site will live at, so metadataBase / canonical / OG image
  // URLs are right on the first publish instead of pointing at an invented
  // domain.
  const siteUrl = resolveProjectSiteUrl({
    publishedUrl: project?.published_url ? String(project.published_url) : null,
    customDomain: project?.custom_domain ? String(project.custom_domain) : null,
    subdomain: project?.cander_subdomain ? String(project.cander_subdomain) : null,
    title: projectName,
  });
  // Sites and apps share the builder; the kind selects the prompt profile and
  // acceptance checklist inside the sandbox.
  const projectKind: "site" | "app" =
    String(project?.kind ?? "").toLowerCase() === "app" ? "app" : "site";

  // Claim atomically: the create route starts jobs in `after()` while a
  // finishing job may also try to start the next queued one.
  const claimed = await transitionBuildJob({
    jobId: job.id,
    from: ["queued"],
    to: "running",
    progressNote: job.facts.mode === "edit" ? "Updating your site…" : "Preparing your workspace…",
  });
  if (!claimed) {
    console.info(LOG, "start skipped; job already claimed", { jobId: job.id });
    return (await getBuildJob(job.id)) ?? job;
  }
  await updateBuildJob(job.id, {
    facts: { startedAt: new Date().toISOString() },
  });
  // Edit jobs keep the preview visible (phase stays ready; HMR shows changes).
  if (job.facts.mode === "create") {
    await setProjectBuildPhase({
      projectId: job.projectId,
      workspaceId: job.workspaceId,
      phase: "planning",
    });
  }
  await appendBuildJobEvents(job.id, [
    { seq: 0, kind: "status", message: "Preparing your workspace", payload: { server: true } },
  ]);

  try {
    const { paths: tipPaths, committed: skeletonCommitted } = await ensureBootSkeleton(
      job,
      projectName,
      projectKind,
    );

    // Skeleton commit moves the tip; any sandbox cloned before that is empty.
    // forceRestart when we just committed so ensure syncs/recreates onto the
    // new tip (Guard 1 tip-mismatch fallthrough also covers late opens).
    let sandbox = await ensureProjectSandbox({
      userId,
      projectId: job.projectId,
      workspaceId: job.workspaceId,
      ...(skeletonCommitted ? { forceRestart: true } : {}),
    });
    // "starting" is fine — the builder waits for the dev server itself.
    if (
      !sandbox.sessionId ||
      sandbox.status === "error" ||
      sandbox.status === "unavailable" ||
      sandbox.status === "needs_repo"
    ) {
      throw new Error(sandbox.message || `Sandbox not available (${sandbox.status}).`);
    }
    // Tip may still lag a in-flight clone that finished after our restart
    // request was refused (active-job guard). One more ensure without restart
    // picks up the tip-mismatch sync path once the VM is ready.
    if (skeletonCommitted && sandbox.status === "starting") {
      sandbox = await ensureProjectSandbox({
        userId,
        projectId: job.projectId,
        workspaceId: job.workspaceId,
      });
      if (
        !sandbox.sessionId ||
        sandbox.status === "error" ||
        sandbox.status === "unavailable" ||
        sandbox.status === "needs_repo"
      ) {
        throw new Error(sandbox.message || `Sandbox not available (${sandbox.status}).`);
      }
    }
    const sessionId = sandbox.sessionId;
    const resolved = await resolveSandboxForSession(sessionId, userId);
    if (!resolved) throw new Error("Sandbox session vanished after ensure.");
    const sb = resolved.sandbox as unknown as BuilderSandbox;

    // Keep the VM alive for the whole job.
    try {
      await sb.extendTimeout?.(JOB_SANDBOX_EXTEND_MS);
    } catch (err) {
      console.warn(LOG, "extendTimeout failed", err instanceof Error ? err.message : err);
    }

    const { transport, apiBase } = resolveBuilderTransport();
    const token = signBuildJobToken({
      jobId: job.id,
      projectId: job.projectId,
      workspaceId: job.workspaceId,
      exp: Math.floor((Date.now() + JOB_SANDBOX_EXTEND_MS + 30 * 60 * 1000) / 1000),
    });
    const models = {
      planner: resolveOpenAIModel(),
      coder: resolveOpenAICodingModel(),
    };
    const twentyFirstEnabled = isTwentyFirstConfigured();

    const pwd = await runPrivilegedSandboxCommand({ sessionId, userId, cmd: "pwd" });
    const repoDir = pwd.stdout.trim() || "/vercel/sandbox";
    const jobDir = `${repoDir}/.cander/jobs/${job.id}`;

    // Durable memory: projects.project_spec. First build seeds it from the
    // setup brief; every job hands it to the builder and mirrors it into the
    // repo (cander.spec.json / DESIGN.md) so the coder can read_file it.
    const brief = job.facts.brief ? cleanBriefAnswers(job.facts.brief as Record<string, unknown>) : null;
    const projectSpec = await loadOrSeedProjectSpec({
      job,
      projectName,
      projectKind,
      brief,
    });

    // One trusted context object per turn (project, repo, backend, deploy,
    // preview, instructions, design system, recent changes). The builder
    // renders `runtimeContext` into its prompt; ids stay server-side.
    const { resolveProjectRuntime, renderProjectRuntimeForAgent } = await import("@/lib/build/project-runtime");
    const runtime = await resolveProjectRuntime({ projectId: job.projectId, workspaceId: job.workspaceId }).catch((err) => {
      console.warn(LOG, "project runtime unavailable", err instanceof Error ? err.message : err);
      return null;
    });

    const config = {
      jobId: job.id,
      projectId: job.projectId,
      workspaceId: job.workspaceId,
      mode: job.facts.mode,
      projectKind,
      projectName,
      siteUrl: runtime?.domains.siteUrl || siteUrl,
      runtimeContext: runtime ? renderProjectRuntimeForAgent(runtime) : null,
      backendStatus: runtime?.backend.status ?? null,
      brief,
      // Brand assets referenced as asset:<id> become short-lived signed URLs
      // the builder can download_image into public/brand/ (config only —
      // the persisted spec keeps the stable asset reference).
      projectSpec: projectSpec ? await withSignedBrandAssets(projectSpec, job.projectId) : null,
      instruction: job.facts.instruction ?? null,
      conversation: job.facts.conversation ?? null,
      condensedContext: job.facts.condensedContext ?? null,
      routeMap: job.facts.mode === "edit" ? routeMapFromPaths(tipPaths) : null,
      apiBase,
      transport,
      twentyFirstEnabled,
      webSearch: isOpenAIWebSearchEnabled(),
      functionalChecks: process.env.CANDER_FUNCTIONAL_CHECKS?.trim() !== "0",
      models,
      // Edits are small, targeted changes — low effort keeps them snappy.
      reasoning:
        process.env.CANDER_BUILDER_REASONING?.trim() ||
        (job.facts.mode === "edit" ? "low" : "medium"),
      devServerUrl: `http://localhost:${BUILD_APP_PORT}`,
      budget: {
        wallClockMs: job.facts.mode === "create" ? CREATE_WALL_CLOCK_MS : EDIT_WALL_CLOCK_MS,
      },
      // Retry: pick up in the same sandbox from the last good phase.
      resume: job.facts.resume ?? null,
    };

    const sources = await readBuilderSources();
    await sb.writeFiles([
      ...sources.map((f) => ({ path: `${repoDir}/${f.path}`, content: f.content })),
      { path: `${jobDir}/config.json`, content: JSON.stringify(config, null, 2) },
      ...(projectSpec
        ? projectSpecRepoFiles(projectSpec).map((f) => ({ path: `${repoDir}/${f.path}`, content: f.content }))
        : []),
    ]);
    // Keep .cander out of git status (persist also skips it defensively).
    await runPrivilegedSandboxCommand({
      sessionId,
      userId,
      cmd: "sh",
      args: ["-c", `mkdir -p .git/info && grep -qx '.cander/' .git/info/exclude 2>/dev/null || echo '.cander/' >> .git/info/exclude`],
    });

    const env: Record<string, string> = {
      CANDER_JOB_TOKEN: token,
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
    };
    if (transport === "direct") {
      // Local-dev fallback only: keys ride along with the builder process.
      const openai = process.env.OPENAI_API_KEY?.trim();
      if (openai) env.OPENAI_API_KEY = openai;
      const k21 = process.env.API_KEY_21ST?.trim() || process.env.TWENTY_FIRST_API_KEY?.trim();
      if (k21) env.API_KEY_21ST = k21;
    }

    await sb.runCommand({
      cmd: "sh",
      args: [
        "-c",
        `cd ${shellQuote(repoDir)} && nohup setsid node ${BUILDER_DIR_IN_SANDBOX}/index.mjs --job ${shellQuote(job.id)} --repo ${shellQuote(repoDir)} > ${shellQuote(`${jobDir}/stdout.log`)} 2>&1 < /dev/null &`,
      ],
      env,
      cwd: repoDir,
      detached: true,
    });

    const updated = await updateBuildJob(job.id, {
      progressNote:
        job.facts.mode === "edit"
          ? "Updating your site…"
          : job.facts.resume
            ? "Picking up where we left off…"
            : projectKind === "app"
              ? "Drafting your app…"
              : "Drafting your website…",
      facts: {
        sessionId,
        transport,
        models,
        lastEventAt: new Date().toISOString(),
      },
    });
    console.info(LOG, "started", {
      jobId: job.id,
      projectId: job.projectId,
      mode: job.facts.mode,
      transport,
      sessionId,
    });
    return updated ?? job;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failBuildJob(job, `Could not start the builder: ${message}`, {
      kind: "infra",
      reason: "start_failed",
      phase: "start",
      detail: message.slice(0, 1500),
      at: new Date().toISOString(),
    });
    throw err;
  }
}

function resolveProjectSiteUrl(opts: {
  publishedUrl: string | null;
  customDomain: string | null;
  subdomain: string | null;
  title: string;
}): string {
  if (opts.publishedUrl?.startsWith("http")) return opts.publishedUrl.replace(/\/+$/, "");
  if (opts.customDomain) return `https://${opts.customDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
  const slug =
    (opts.subdomain || slugFromProjectName(opts.title || "site"))
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "site";
  return `https://${slug}.cander.app`;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// ---------------------------------------------------------------------------
// Sync (pull events, detect completion)
// ---------------------------------------------------------------------------

const syncInFlight = new Map<string, Promise<BuildJob>>();

export async function syncBuildJob(jobId: string): Promise<BuildJob | null> {
  const existing = syncInFlight.get(jobId);
  if (existing) return existing;
  const p = (async () => {
    const job = await getBuildJob(jobId);
    if (!job) throw new Error("job not found");
    if (job.status === "verifying") return reclaimStuckVerifyingJob(job);
    if (job.status !== "running") return job;
    return pullAndProcess(job);
  })();
  syncInFlight.set(jobId, p);
  try {
    return await p;
  } finally {
    syncInFlight.delete(jobId);
  }
}

/**
 * After the builder emits `finished`, the server moves the job to `verifying`
 * and runs persist + finalize. If that worker dies mid-flight (common on long
 * finalize), the UI stays on "Checking your pages…" forever. Recover:
 * - draft already saved → mark ready
 * - otherwise fail with Retry after VERIFY_STALL_MS
 */
async function reclaimStuckVerifyingJob(job: BuildJob): Promise<BuildJob> {
  const lastAt = Date.parse(job.updatedAt || job.facts.lastEventAt || job.createdAt);
  const age = Date.now() - (Number.isFinite(lastAt) ? lastAt : Date.now());
  if (age < VERIFY_STALL_MS) return job;

  const draftSha = job.facts.draftSha || null;
  // Prefer project tip — persist may have written it before the hang.
  let tip: string | null = draftSha;
  try {
    const admin = (await import("@/lib/supabase/admin")).createSupabaseAdminClient();
    const { data } = await admin
      .from("projects")
      .select("draft_sha")
      .eq("id", job.projectId)
      .maybeSingle();
    if (data?.draft_sha) tip = String(data.draft_sha);
  } catch {
    /* ignore */
  }

  if (tip) {
    console.warn(LOG, "reclaim verifying → ready", { jobId: job.id, tip, ageMs: age });
    await appendBuildJobEvents(job.id, [
      {
        seq: 100003,
        kind: "status",
        message: job.facts.mode === "edit" ? "Preview ready" : "Draft ready",
        payload: { server: true, draftSha: tip, reclaimed: true },
      },
    ]).catch(() => {});
    try {
      await setProjectBuildPhase({
        projectId: job.projectId,
        workspaceId: job.workspaceId,
        phase: "ready",
      });
    } catch {
      /* ignore */
    }
    const summary =
      job.facts.summary ||
      job.resultSummary ||
      (job.facts.mode === "edit" ? "Your change is in the preview." : "Your draft is ready.");
    const done = await updateBuildJob(job.id, {
      status: "ready_for_review",
      progressNote: job.facts.mode === "edit" ? "Preview ready" : "Draft ready",
      resultSummary: summary,
      facts: {
        finishedAt: new Date().toISOString(),
        draftSha: tip,
        verifyOk: true,
        summary,
        error: undefined,
      },
    });
    await startNextQueuedJob(job);
    return done ?? job;
  }

  return (
    (await failBuildJob(job, "Verifying worker stalled before the draft was saved.", {
      kind: "infra",
      reason: "verify_stall",
      phase: "finalize",
      detail: `No progress for ${Math.round(age / 1000)}s in verifying`,
      at: new Date().toISOString(),
    })) ?? job
  );
}

/**
 * Fail a job whose start threw before the runner could take over (used by
 * callers that start jobs from a background context). Idempotent.
 */
export async function markBuildJobStartFailed(jobId: string, error: string): Promise<BuildJob | null> {
  const job = await getBuildJob(jobId);
  if (!job) return null;
  if (job.status !== "running" && job.status !== "queued") return job;
  if (job.status === "queued") {
    await transitionBuildJob({ jobId, from: ["queued"], to: "running", progressNote: "Preparing your workspace…" });
  }
  return failBuildJob(job, error, {
    kind: "infra",
    reason: "start_failed",
    phase: "start",
    detail: error.slice(0, 1500),
    at: new Date().toISOString(),
  });
}

async function pullAndProcess(job: BuildJob): Promise<BuildJob> {
  const sessionId = job.facts.sessionId;
  const userId = job.facts.userId;
  if (!sessionId) {
    // Start-stall: the worker that claimed this job died before attaching a
    // sandbox. Give a real start time to finish, then fail so Retry appears.
    const startedAt = Date.parse(job.facts.startedAt || job.updatedAt || job.createdAt);
    const age = Date.now() - (Number.isFinite(startedAt) ? startedAt : Date.now());
    if (age > START_STALL_MS) {
      return (
        (await failBuildJob(job, "The workspace never came up for this job.", {
          kind: "infra",
          reason: "start_stalled",
          phase: "start",
          detail: `No sandbox session ${Math.round(age / 1000)}s after start`,
          at: new Date().toISOString(),
        })) ?? job
      );
    }
    return job;
  }

  const offset = job.facts.eventOffset ?? 0;
  const eventsFile = `.cander/jobs/${job.id}/events.jsonl`;
  let out: { stdout: string; stderr: string; exitCode: number };
  try {
    out = await runPrivilegedSandboxCommand({
      sessionId,
      userId,
      cmd: "sh",
      args: [
        "-c",
        // printf (no newline) so the events segment is byte-exact file content.
        `if [ -f ${eventsFile} ]; then tail -c +${offset + 1} ${eventsFile}; fi; printf '__CANDER_SEP__'; echo; if [ -f .cander/jobs/${job.id}/pid ] && kill -0 "$(cat .cander/jobs/${job.id}/pid)" 2>/dev/null; then echo alive; else echo dead; fi; if [ -f .cander/jobs/${job.id}/result.json ]; then echo hasresult; fi; tail -c 1500 .cander/jobs/${job.id}/stdout.log 2>/dev/null`,
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Sandbox gone (expired / stopped) — the job cannot complete.
    if (/not found|expired|stopped|410|404/i.test(message)) {
      return (
        (await failBuildJob(job, `The build environment stopped before finishing (${message}).`, {
          kind: "infra",
          reason: "sandbox_gone",
          phase: "running",
          detail: message.slice(0, 800),
          at: new Date().toISOString(),
        })) ?? job
      );
    }
    console.warn(LOG, "sync read failed", message);
    return job;
  }

  const sepAt = out.stdout.indexOf("__CANDER_SEP__");
  const rawEvents = sepAt >= 0 ? out.stdout.slice(0, sepAt) : "";
  const meta = sepAt >= 0 ? out.stdout.slice(sepAt + "__CANDER_SEP__".length) : "";
  // Only consume complete lines; a partial trailing line is re-read next time.
  const lastNl = rawEvents.lastIndexOf("\n");
  const complete = lastNl >= 0 ? rawEvents.slice(0, lastNl + 1) : "";
  const fileBytesConsumed = Buffer.byteLength(complete, "utf8");
  const events: BuildJobEvent[] = [];
  for (const line of complete.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t) as BuildJobEvent;
      if (typeof e.seq === "number" && e.kind) events.push(e);
    } catch {
      /* skip malformed line */
    }
  }

  const alive = /(^|\n)alive(\n|$)/.test(meta);
  const hasResult = /hasresult/.test(meta);

  let current = job;
  if (fileBytesConsumed > 0) {
    await appendBuildJobEvents(job.id, events);
    await recordRunToolCalls(job, events).catch(() => undefined);
    const runStatus = runStatusFromEvents(events);
    if (runStatus) await setBuildRunStatus(job.id, runStatus).catch(() => undefined);
    const lastProgress = [...events]
      .reverse()
      .find((e) => e.kind === "progress" || e.kind === "status");
    const phase = job.facts.mode === "create" ? phaseForEvents(events) : null;
    if (phase) {
      await setProjectBuildPhase({
        projectId: job.projectId,
        workspaceId: job.workspaceId,
        phase,
      });
    }
    const noteRaw = lastProgress?.message ?? job.progressNote;
    const note = sanitizeUserProgress(noteRaw) ?? job.progressNote;
    current =
      (await updateBuildJob(job.id, {
        progressNote: note,
        facts: {
          eventOffset: offset + fileBytesConsumed,
          eventSeq: Math.max(job.facts.eventSeq ?? 0, ...events.map((e) => e.seq)),
          ...(events.length ? { lastEventAt: new Date().toISOString() } : {}),
        },
      })) ?? job;
  }

  const finished = events.find((e) => e.kind === "finished");
  const failed = events.find((e) => e.kind === "failed");
  if (finished) {
    return (await completeBuildJob(current, finished)) ?? current;
  }
  if (failed) {
    return (await failBuildJob(current, failed.message || "Builder failed.", failureFromEvent(failed))) ?? current;
  }

  const lastAt = Date.parse(
    current.facts.lastEventAt || current.facts.startedAt || current.createdAt,
  );
  const silentMs = Date.now() - (Number.isFinite(lastAt) ? lastAt : Date.now());

  // Dead process without a terminal event → fail after a short grace period
  // (the final flush may still be landing).
  if (!alive && !hasResult) {
    if (silentMs > STALL_GRACE_MS) {
      const tail = meta.split("\n").slice(-12).join("\n").trim();
      return (
        (await failBuildJob(current, "The builder process exited unexpectedly.", {
          kind: "infra",
          reason: "builder_exited",
          phase: "running",
          detail: tail.slice(0, 800) || null,
          at: new Date().toISOString(),
        })) ?? current
      );
    }
  }

  // Alive but silent for too long (e.g. hung on `npm run dev`) — unlock the UI.
  if (!hasResult && silentMs > EVENT_STALL_MS) {
    return (
      (await failBuildJob(current, "Something took too long while drafting.", {
        kind: "infra",
        reason: "event_stall",
        phase: "running",
        detail: `No builder events for ${Math.round(silentMs / 1000)}s`,
        at: new Date().toISOString(),
      })) ?? current
    );
  }
  return current;
}

function phaseForEvents(events: BuildJobEvent[]): BuildPhase | null {
  let phase: BuildPhase | null = null;
  for (const e of events) {
    if (e.kind !== "status") continue;
    const m = e.message.toLowerCase();
    if (m.startsWith("planning")) phase = "planning";
    else if (m.startsWith("building") || m.startsWith("making")) phase = "implementing";
    else if (
      m.startsWith("verifying") ||
      m.startsWith("preparing preview") ||
      m.startsWith("repairing") ||
      m.startsWith("checking the previous")
    )
      phase = "validating";
  }
  return phase;
}

/** Turn the builder's `failed` event payload into a stored failure record. */
function failureFromEvent(e: BuildJobEvent): BuildJobFailure {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const kindRaw = String(p.classification ?? "unknown");
  const kind: BuildJobFailureKind = (["infra", "app", "budget", "agent"] as const).includes(
    kindRaw as BuildJobFailureKind & ("infra" | "app" | "budget" | "agent"),
  )
    ? (kindRaw as BuildJobFailureKind)
    : "unknown";
  const stats = (p.stats ?? {}) as Record<string, unknown>;
  const files = Array.isArray(p.files) ? (p.files as unknown[]) : [];
  const filesTouched =
    typeof stats.filesTouched === "number"
      ? stats.filesTouched
      : files.length > 0
        ? files.length
        : undefined;
  return {
    kind,
    reason: typeof p.reason === "string" ? p.reason : null,
    cause: typeof p.cause === "string" ? p.cause : null,
    detail: e.message?.slice(0, 1500) || null,
    diagnostics: typeof p.diagnostics === "string" ? p.diagnostics.slice(0, 1500) : null,
    phase: "builder",
    at: new Date().toISOString(),
    recovery: p.recovery ?? null,
    filesTouched,
  };
}

/** Push path: builder POSTed events directly. */
export async function ingestPushedBuildJobEvents(
  jobId: string,
  events: BuildJobEvent[],
): Promise<void> {
  const job = await getBuildJob(jobId);
  if (!job || job.status !== "running") return;
  const clean = events.filter((e) => typeof e.seq === "number" && e.kind);
  if (!clean.length) return;
  await appendBuildJobEvents(job.id, clean);
  await recordRunToolCalls(job, clean).catch(() => undefined);
  const runStatus = runStatusFromEvents(clean);
  if (runStatus) await setBuildRunStatus(job.id, runStatus).catch(() => undefined);
  const lastProgress = [...clean]
    .reverse()
    .find((e) => e.kind === "progress" || e.kind === "status");
  const phase = job.facts.mode === "create" ? phaseForEvents(clean) : null;
  if (phase) {
    await setProjectBuildPhase({
      projectId: job.projectId,
      workspaceId: job.workspaceId,
      phase,
    });
  }
  const noteRaw = lastProgress?.message ?? job.progressNote;
  const note = sanitizeUserProgress(noteRaw) ?? job.progressNote;
  const updated =
    (await updateBuildJob(job.id, {
      progressNote: note,
      facts: {
        eventSeq: Math.max(job.facts.eventSeq ?? 0, ...clean.map((e) => e.seq)),
        lastEventAt: new Date().toISOString(),
      },
    })) ?? job;
  const finished = clean.find((e) => e.kind === "finished");
  const failed = clean.find((e) => e.kind === "failed");
  if (finished) await completeBuildJob(updated, finished);
  else if (failed) await failBuildJob(updated, failed.message || "Builder failed.", failureFromEvent(failed));
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

async function completeBuildJob(
  job: BuildJob,
  finished: BuildJobEvent,
): Promise<BuildJob | null> {
  // Only one worker may complete a job.
  const won = await transitionBuildJob({
    jobId: job.id,
    from: ["running"],
    to: "verifying",
    progressNote: job.facts.mode === "edit" ? "Saving your change…" : "Saving your draft…",
  });
  if (!won) return getBuildJob(job.id);

  const sessionId = job.facts.sessionId;
  const userId = job.facts.userId;
  const summary =
    (finished.payload?.summary as string | undefined) || finished.message || "Draft updated.";
  const partial = Boolean(finished.payload?.partial);
  // The builder wrote the site but could not bring the preview up inside the
  // sandbox. The code is not suspected — the server now owns preview recovery.
  const unverified = Boolean(finished.payload?.unverified);
  const stats = (finished.payload?.stats ?? null) as Record<string, unknown> | null;
  const builderBuildPassed = finished.payload?.buildVerified === true && !partial && !unverified;
  if (unverified) {
    await updateBuildJob(job.id, {
      facts: {
        unverified: true,
        ...(stats ? { stats } : {}),
      },
    }).catch(() => {});
  }

  try {
    if (!sessionId) throw new Error("job has no sandbox session");
    await appendBuildJobEvents(job.id, [
      {
        seq: 100000,
        kind: "status",
        message: job.facts.mode === "edit" ? "Saving your change" : "Saving your draft",
        payload: { server: true },
      },
    ]);
    // Fold the builder's spec updates into projects.project_spec and refresh
    // the repo mirror before the commit so DESIGN.md never lags the code.
    await applySpecUpdatesFromJob({ job, summary, sessionId, userId });
    const persisted = await persistSandboxToDraft({
      sessionId,
      userId,
      projectId: job.projectId,
      workspaceId: job.workspaceId,
      message:
        job.facts.mode === "create"
          ? "Cander: draft website"
          : `Cander: ${(job.facts.instruction || "edit").slice(0, 72)}`,
    });
    if (persisted.outcome === "db_sync_failed") {
      throw new Error(persisted.error || "Draft commit saved but database sync failed.");
    }
    let draftSha = persisted.draftSha || null;
    if (!draftSha && persisted.outcome === "noop") {
      // The agent may have saved checkpoints mid-run (git.checkpoint tool), so
      // "nothing left to commit" still means the draft tip moved this job.
      const { data: tip } = await createSupabaseAdminClient()
        .from("projects")
        .select("draft_sha")
        .eq("id", job.projectId)
        .maybeSingle();
      draftSha = tip?.draft_sha ? String(tip.draft_sha) : null;
    }
    await updateBuildJob(job.id, {
      progressNote: job.facts.mode === "edit" ? "Saving your change…" : "Saving your draft…",
      facts: { draftSha },
    }).catch(() => {});
    await appendBuildJobEvents(job.id, [
      {
        seq: 100001,
        kind: "status",
        message:
          persisted.outcome === "noop"
            ? "No file changes to save"
            : `Saved ${persisted.filesCommitted} file(s) to the draft`,
        payload: { server: true, outcome: persisted.outcome, draftSha },
      },
    ]);

    if (job.facts.mode === "create") {
      // First build: boot + preview_check + ready (server-authoritative).
      // For an unverified handoff this IS the preview-recovery phase: finalize
      // fast-forwards the VM, restarts the dev server, reinstalls or recreates.
      await appendBuildJobEvents(job.id, [
        {
          seq: 100002,
          kind: "status",
          message: unverified ? "Preparing preview" : "Starting the preview",
          payload: { server: true, unverified },
        },
      ]);
      const ready = await Promise.race([
        finalizeBuildReady({
          userId,
          projectId: job.projectId,
          workspaceId: job.workspaceId,
        }),
        new Promise<Awaited<ReturnType<typeof finalizeBuildReady>>>((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: false,
                phase: "failed",
                draftSha: draftSha,
                sessionId: sessionId,
                reason: "Preview startup timed out after the draft was saved.",
              }),
            FINALIZE_READY_TIMEOUT_MS,
          ),
        ),
      ]);
      if (!ready.ok) {
        const timedOut = /timed out after the draft was saved/i.test(ready.reason || "");
        if (unverified && !timedOut) {
          // Nobody has seen this site render: the sandbox could not start it
          // and the server's escalating repair (restart → reinstall →
          // recreate) failed too. That is a genuine platform failure — say so
          // plainly and keep the draft so Retry resumes at verification.
          throw new BuildFailure("The preview couldn’t be started for your draft.", {
            kind: "infra",
            reason: "preview_recovery_failed",
            phase: "finalize",
            cause: ready.reason || null,
            detail: ready.reason || null,
            diagnostics: ready.diagnostics || null,
            at: new Date().toISOString(),
          });
        }
        // Draft is already on GitHub and (for verified runs) every route
        // rendered inside the sandbox — unlock the UI as ready rather than
        // leaving the job stuck; the preview panel keeps repairing on its own.
        console.warn(LOG, "finalize timed out/failed; marking ready with saved draft", {
          jobId: job.id,
          reason: ready.reason,
          draftSha,
          unverified,
        });
        await appendBuildJobEvents(job.id, [
          {
            seq: 100010,
            kind: "log",
            message: `Preview finalize deferred: ${ready.reason || "unknown"}`,
            payload: { server: true },
          },
        ]).catch(() => {});
      } else {
        draftSha = ready.draftSha ?? draftSha;
      }
    } else {
      // Edit: the warm dev server already reflects the change via HMR — just
      // confirm it still answers. No sandbox recreate, no phase churn.
      const { runSandboxPreviewCheck } = await import("@/lib/build/preview/preview-check");
      const health = await runSandboxPreviewCheck({ sessionId, userId });
      if (!health.ok) {
        throw new Error(health.reason || "Preview stopped responding after the change.");
      }
    }

    await appendBuildJobEvents(job.id, [
      {
        seq: 100003,
        kind: "status",
        message: job.facts.mode === "edit" ? "Preview ready" : "Draft ready",
        payload: { server: true, draftSha },
      },
    ]);
    const readyNote = job.facts.mode === "edit" ? "Preview ready" : "Draft ready";
    const done = await updateBuildJob(job.id, {
      status: "ready_for_review",
      progressNote: partial ? `${readyNote} (partial)` : readyNote,
      resultSummary: summary,
      facts: {
        finishedAt: new Date().toISOString(),
        draftSha,
        // A non-partial finish means the in-sandbox acceptance (tsc + every
        // route) passed for this exact tip; publish preflight reuses it.
        verifyOk: !partial && !unverified,
        unverified,
        summary,
        ...(stats ? { stats } : {}),
        ...(builderBuildPassed && draftSha
          ? { buildVerified: { sha: draftSha, at: new Date().toISOString() } }
          : {}),
      },
    });
    console.info(LOG, "ready", { jobId: job.id, draftSha, unverified });
    await finishBuildRun(job, { status: "complete", resultSha: draftSha, summary, stats }).catch(() => undefined);
    await startNextQueuedJob(job);
    if (job.facts.publishFix && !unverified) {
      // Publish auto-fix loop: the repair landed, so try going live again.
      const { republishAfterFix } = await import("@/lib/build/publish/auto-fix");
      await republishAfterFix(job).catch((err) =>
        console.warn(LOG, "republish after fix failed", err instanceof Error ? err.message : err),
      );
    }
    return done;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failure: BuildJobFailure =
      err instanceof BuildFailure
        ? err.failure
        : {
            kind: "infra",
            reason: "finalize_error",
            phase: "finalize",
            detail: message.slice(0, 1500),
            at: new Date().toISOString(),
          };
    return failBuildJob(
      { ...job, status: "verifying" },
      err instanceof BuildFailure ? err.message : "Something went wrong while saving your draft.",
      failure,
    );
  }
}

/** Failure with an attached operator-facing classification. */
class BuildFailure extends Error {
  failure: BuildJobFailure;
  constructor(message: string, failure: BuildJobFailure) {
    super(message);
    this.failure = failure;
  }
}

// ---------------------------------------------------------------------------
// Project spec (durable memory)
// ---------------------------------------------------------------------------

async function withSignedBrandAssets(spec: ProjectSpec, projectId: string): Promise<ProjectSpec> {
  const brand = spec.brand;
  if (!brand) return spec;
  const out = { ...brand };
  const pairs: Array<[keyof typeof brand, keyof typeof brand]> = [
    ["logoPath", "logoUrl"],
    ["faviconPath", "faviconUrl"],
    ["ogImagePath", "ogImageUrl"],
  ];
  for (const [pathKey, urlKey] of pairs) {
    const ref = brand[pathKey];
    if (!ref || !ref.startsWith("asset:")) continue;
    try {
      const signed = await signedProjectAssetUrl({ assetId: ref.slice("asset:".length), projectId });
      if (signed) out[urlKey] = signed.url;
    } catch (err) {
      console.warn(LOG, "asset sign failed", { ref, error: err instanceof Error ? err.message : err });
    }
  }
  return { ...spec, brand: out };
}

async function loadOrSeedProjectSpec(opts: {
  job: BuildJob;
  projectName: string;
  projectKind: "site" | "app";
  brief: Record<string, unknown> | null;
}): Promise<ProjectSpec | null> {
  const { job } = opts;
  try {
    const existing = await loadPlanFirstArtifacts(job.projectId, job.workspaceId);
    if (existing.projectSpec) {
      // Standing instruction on a create job with an explicit prompt.
      return existing.projectSpec;
    }
    if (job.facts.mode !== "create" && !opts.brief) return null;
    const seeded = projectSpecFromSetupBrief({
      answers: opts.brief,
      projectName: opts.projectName,
      kind: opts.projectKind,
      instruction: job.facts.mode === "create" ? job.facts.instruction ?? null : null,
    });
    await savePlanFirstArtifacts({
      projectId: job.projectId,
      workspaceId: job.workspaceId,
      projectSpec: seeded,
    });
    return seeded;
  } catch (err) {
    console.warn(LOG, "project spec load/seed failed", err instanceof Error ? err.message : err);
    return null;
  }
}

async function applySpecUpdatesFromJob(opts: {
  job: BuildJob;
  summary: string;
  sessionId: string;
  userId: string;
}): Promise<void> {
  const { job } = opts;
  try {
    const events = await listBuildJobEvents({ jobId: job.id, limit: 500 });
    const updates = events.filter((e) => e.kind === "spec_update");
    const current = (await loadPlanFirstArtifacts(job.projectId, job.workspaceId)).projectSpec;
    if (!current) return;
    let next = current;
    for (const ev of updates) {
      const patch = ev.payload?.patch;
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) continue;
      const decision = typeof ev.payload?.decision === "string" ? ev.payload.decision : ev.message;
      next = mergeProjectSpecPatch(next, patch as Record<string, unknown>, {
        summary: decision,
        source: "builder",
      });
    }
    if (job.facts.mode === "edit") {
      next = mergeProjectSpecPatch(
        next,
        { lastEditSummary: opts.summary.slice(0, 400) },
        job.facts.instruction
          ? { summary: `Edit: ${job.facts.instruction.slice(0, 200)}`, source: "user" }
          : undefined,
      );
    } else {
      next = mergeProjectSpecPatch(next, { lastEditSummary: opts.summary.slice(0, 400) });
    }
    await savePlanFirstArtifacts({
      projectId: job.projectId,
      workspaceId: job.workspaceId,
      projectSpec: next,
    });
    const resolved = await resolveSandboxForSession(opts.sessionId, opts.userId);
    if (!resolved) return;
    const sb = resolved.sandbox as unknown as BuilderSandbox;
    const pwd = await runPrivilegedSandboxCommand({ sessionId: opts.sessionId, userId: opts.userId, cmd: "pwd" });
    const repoDir = pwd.stdout.trim() || "/vercel/sandbox";
    await sb.writeFiles(
      projectSpecRepoFiles(next).map((f) => ({ path: `${repoDir}/${f.path}`, content: f.content })),
    );
  } catch (err) {
    // Memory is best-effort; the draft itself must still be saved.
    console.warn(LOG, "spec update failed", { jobId: job.id, error: err instanceof Error ? err.message : err });
  }
}

/** DB-backed coalescing: edits sent while a job runs wait in `queued`. */
async function startNextQueuedJob(after: BuildJob): Promise<void> {
  try {
    const next = await findQueuedBuildJob({
      projectId: after.projectId,
      workspaceId: after.workspaceId,
    });
    if (!next) return;
    console.info(LOG, "starting queued job", { jobId: next.id, after: after.id });
    await startBuildJob(next);
  } catch (err) {
    console.warn(LOG, "queued job start failed", err instanceof Error ? err.message : err);
  }
}

/**
 * User-requested cancel. Stops the builder process in the sandbox, returns an
 * edit's working tree to the draft tip, records the run as canceled and lets
 * the next queued change start. Idempotent.
 */
export async function cancelBuildJob(opts: { jobId: string; userId: string }): Promise<BuildJob | null> {
  const job = await getBuildJob(opts.jobId);
  if (!job) return null;
  if (!["queued", "running", "verifying"].includes(job.status)) return job;
  const won = await transitionBuildJob({
    jobId: job.id,
    from: ["queued", "running", "verifying"],
    to: "cancelled",
    progressNote: "Stopped",
  });
  if (!won) return getBuildJob(job.id);

  const sessionId = job.facts.sessionId;
  if (sessionId) {
    try {
      await runPrivilegedSandboxCommand({
        sessionId,
        userId: opts.userId,
        cmd: "sh",
        args: ["-c", `if [ -f .cander/jobs/${job.id}/pid ]; then kill "$(cat .cander/jobs/${job.id}/pid)" 2>/dev/null || true; sleep 1; kill -9 "$(cat .cander/jobs/${job.id}/pid)" 2>/dev/null || true; fi`],
      });
    } catch (err) {
      console.warn(LOG, "cancel: builder kill skipped", { jobId: job.id, error: err instanceof Error ? err.message : err });
    }
    if (job.facts.mode === "edit") {
      await resetSandboxToDraftTip({ sessionId, userId: opts.userId, jobId: job.id }).catch(() => undefined);
    }
  }
  await appendBuildJobEvents(job.id, [
    { seq: 100008, kind: "cancelled", message: "Stopped at your request.", payload: { server: true } },
  ]).catch(() => undefined);
  if (job.facts.mode === "create") {
    await setProjectBuildPhase({ projectId: job.projectId, workspaceId: job.workspaceId, phase: "failed" }).catch(() => undefined);
  }
  const updated = await updateBuildJob(job.id, {
    status: "cancelled",
    progressNote: "Stopped",
    resultSummary: "Stopped at your request.",
    facts: { finishedAt: new Date().toISOString() },
  });
  await finishBuildRun(job, { status: "canceled", resultSha: job.facts.draftSha ?? null, summary: "Stopped at your request." }).catch(() => undefined);
  await startNextQueuedJob(job);
  return updated;
}

/**
 * Terminal failure. `error` is the raw/internal message; users only ever see
 * the plain-English line derived from `failure.kind`. For create jobs the
 * sandbox working tree is committed first so nothing is lost and Retry can
 * resume from verification instead of rebuilding.
 */
async function failBuildJob(
  job: BuildJob,
  error: string,
  failure?: BuildJobFailure,
): Promise<BuildJob | null> {
  const f: BuildJobFailure = failure ?? {
    kind: "unknown",
    reason: null,
    detail: error.slice(0, 1500),
    at: new Date().toISOString(),
  };
  console.warn(LOG, "failed", {
    jobId: job.id,
    kind: f.kind,
    reason: f.reason,
    cause: f.cause,
    phase: f.phase,
    error: error.slice(0, 300),
  });

  // Save what the builder produced (create only). A failed edit leaves the
  // still-working draft alone.
  const fresh = await getBuildJob(job.id).catch(() => null);
  let draftSha: string | null = fresh?.facts.draftSha ?? job.facts.draftSha ?? null;
  let saved = false;
  const wroteFiles = (f.filesTouched ?? 0) > 0 || f.phase === "finalize";
  if (job.facts.mode === "create" && job.facts.sessionId && job.facts.userId && wroteFiles && !draftSha) {
    try {
      const persisted = await persistSandboxToDraft({
        sessionId: job.facts.sessionId,
        userId: job.facts.userId,
        projectId: job.projectId,
        workspaceId: job.workspaceId,
        message: "Cander: draft website (unverified — build did not finish)",
      });
      if (persisted.outcome === "committed" || persisted.outcome === "partial") {
        draftSha = persisted.draftSha || draftSha;
        saved = Boolean(draftSha);
      } else if (persisted.outcome === "noop" && persisted.draftSha) {
        draftSha = persisted.draftSha;
        saved = true;
      }
    } catch (err) {
      console.warn(LOG, "persist on failure skipped", { jobId: job.id, error: err instanceof Error ? err.message : err });
    }
  } else if (draftSha) {
    saved = true;
  }

  // Atomic edits: a failed change never leaves the working tree half-applied.
  // Put the sandbox back on the draft tip so the preview shows what is saved.
  if (job.facts.mode === "edit" && job.facts.sessionId && job.facts.userId) {
    await resetSandboxToDraftTip({ sessionId: job.facts.sessionId, userId: job.facts.userId, jobId: job.id }).catch((err) =>
      console.warn(LOG, "reset after failed edit skipped", { jobId: job.id, error: err instanceof Error ? err.message : err }),
    );
  }

  const userCopy = userFacingFailure(f.kind, saved);
  await finishBuildRun(job, { status: "failed", resultSha: draftSha, summary: userCopy, failure: f }).catch(() => undefined);
  await appendBuildJobEvents(job.id, [
    {
      seq: 100009,
      kind: "failed",
      message: userCopy,
      payload: {
        server: true,
        classification: f.kind,
        reason: f.reason ?? null,
        cause: f.cause ?? null,
        phase: f.phase ?? null,
        internal: error.slice(0, 2000),
        diagnostics: f.diagnostics ?? null,
        draftSaved: saved,
        draftSha,
      },
    },
  ]);
  if (job.facts.mode === "create") {
    await setProjectBuildPhase({
      projectId: job.projectId,
      workspaceId: job.workspaceId,
      phase: "failed",
    });
    try {
      const brief = await loadWebsiteSetupBrief(job.projectId, job.workspaceId);
      await saveWebsiteSetupBrief({
        projectId: job.projectId,
        workspaceId: job.workspaceId,
        brief: {
          ...brief,
          status: "failed",
          validationIssues: [userCopy],
          updatedAt: new Date().toISOString(),
        },
      });
    } catch {
      /* best-effort */
    }
  }
  const failed = await updateBuildJob(job.id, {
    status: "failed",
    progressNote: "Build failed",
    resultSummary: userCopy,
    facts: {
      finishedAt: new Date().toISOString(),
      error: userCopy,
      draftSha,
      failure: { ...f, detail: (f.detail ?? error).slice(0, 1500) },
    },
  });
  await startNextQueuedJob(job);
  return failed;
}

/**
 * Discard uncommitted work in the sandbox and return to the draft tip. Keeps
 * ignored files (.env.local, node_modules, .next) and Cander's own job files.
 */
export async function resetSandboxToDraftTip(opts: { sessionId: string; userId: string; jobId?: string | null }): Promise<void> {
  await runPrivilegedSandboxCommand({
    sessionId: opts.sessionId,
    userId: opts.userId,
    cmd: "bash",
    args: [
      "-c",
      `set -e
if [ ! -d .git ]; then
  git_dir=$(find . -maxdepth 3 -type d -name .git 2>/dev/null | head -1 || true)
  if [ -n "\${git_dir}" ]; then cd "$(dirname "\${git_dir}")"; fi
fi
git reset --hard -q HEAD 2>/dev/null || true
git clean -fdq -e .cander -e .env.local -e '.env*.local' 2>/dev/null || true`,
    ],
  });
}

/** The only failure text a user sees. No stacks, ports, HTTP codes or file names. */
function userFacingFailure(kind: BuildJobFailureKind, draftSaved: boolean): string {
  const saved = draftSaved ? " Your work so far is saved and I can pick up where I left off." : "";
  switch (kind) {
    case "infra":
      return `The preview environment hit a problem on our side, not in your site.${saved}`;
    case "app":
      return `The draft didn’t pass all of my checks yet.${draftSaved ? " It’s saved — I can pick up and fix what’s left." : ""}`;
    case "budget":
      return `This took longer than expected, so I paused${draftSaved ? " and saved what’s done" : ""}.`;
    case "agent":
    case "unknown":
    default:
      return `I hit a snag while drafting.${saved}`;
  }
}

// ---------------------------------------------------------------------------
// Retry (resume, don't restart)
// ---------------------------------------------------------------------------

/**
 * Smart retry for a failed create job: diagnose why it failed and continue in
 * the same sandbox from the last good phase.
 *
 *  infra (preview never came up, builder died)   → verify: files exist; check
 *                                                   the preview, repair only if
 *                                                   verification finds app bugs
 *  app (verification failed)                     → verify → repair with report
 *  budget / agent / unknown                      → build: re-run the coder,
 *                                                   reusing the saved plan
 *  nothing written                               → build from scratch
 */
export async function retryBuildJob(opts: {
  projectId: string;
  workspaceId: string;
  userId: string;
}): Promise<{ ok: true; job: BuildJob; resume: BuildJobResume } | { ok: false; error: string; status: number; job?: BuildJob | null }> {
  const active = await findActiveBuildJob({ projectId: opts.projectId, workspaceId: opts.workspaceId });
  if (active) {
    const synced = active.status === "running" ? await syncBuildJob(active.id) : active;
    if (synced && ["queued", "running", "verifying"].includes(synced.status)) {
      return { ok: false, error: "A build is already running for this project.", status: 409, job: synced };
    }
  }
  const previous = await findLatestBuildJob({ projectId: opts.projectId, workspaceId: opts.workspaceId });
  if (!previous || previous.status !== "failed" || previous.facts.mode !== "create") {
    return { ok: false, error: "There is no failed build to retry.", status: 404, job: previous };
  }

  const f = previous.facts.failure;
  const filesTouched =
    f?.filesTouched ??
    (typeof previous.facts.stats?.filesTouched === "number" ? (previous.facts.stats.filesTouched as number) : 0);
  const hasWork = Boolean(previous.facts.draftSha) || filesTouched > 0;
  const kind = f?.kind ?? "unknown";
  const phase: BuildJobResume["phase"] = hasWork && (kind === "infra" || kind === "app") ? "verify" : "build";
  const attempt = (previous.facts.resume?.attempt ?? 0) + 1;

  // Routes the previous run reported (finish() / failed payload) so verify
  // covers the whole site even if the plan file is gone.
  let routes: string[] = [];
  try {
    const events = await listBuildJobEvents({ jobId: previous.id, limit: 500 });
    const terminal = [...events].reverse().find((e) => e.kind === "failed" || e.kind === "finished");
    const r = terminal?.payload?.routes;
    if (Array.isArray(r)) routes = r.map(String).filter((x) => x.startsWith("/"));
  } catch {
    /* optional */
  }
  const resume: BuildJobResume = {
    fromJobId: previous.id,
    phase,
    routes,
    summary: previous.facts.summary ?? null,
    attempt,
  };
  console.info(LOG, "retry", {
    projectId: opts.projectId,
    fromJobId: previous.id,
    kind,
    reason: f?.reason,
    phase,
    attempt,
  });

  const brief = await loadWebsiteSetupBrief(opts.projectId, opts.workspaceId);
  const job = await createBuildJob({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    threadId: previous.threadId,
    mode: "create",
    title: previous.title,
    goal: previous.goal,
    instruction: previous.facts.instruction,
    conversation: previous.facts.conversation ?? null,
    condensedContext: previous.facts.condensedContext ?? null,
    brief: brief?.answers ?? previous.facts.brief ?? null,
    resume,
  });
  return { ok: true, job, resume };
}

// ---------------------------------------------------------------------------
// Read model for the UI
// ---------------------------------------------------------------------------

export async function buildJobSnapshot(opts: {
  jobId: string;
  afterSeq?: number;
}): Promise<{ job: BuildJob; events: BuildJobEvent[] } | null> {
  const job = await getBuildJob(opts.jobId);
  if (!job) return null;
  const events = await listBuildJobEvents({
    jobId: job.id,
    afterSeq: opts.afterSeq ?? 0,
    limit: 300,
  });
  return { job, events };
}
