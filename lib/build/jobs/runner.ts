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
import {
  appendBuildJobEvents,
  findQueuedBuildJob,
  getBuildJob,
  listBuildJobEvents,
  transitionBuildJob,
  updateBuildJob,
  type BuildJob,
  type BuildJobEvent,
  type BuildJobTransport,
} from "@/lib/build/jobs/store";
import { bootSkeletonFiles } from "@/lib/build/jobs/boot-skeleton";

const LOG = "[cander:build-job]";
const BUILDER_DIR_IN_SANDBOX = ".cander/builder";
/** How long a job may keep its sandbox alive (Vercel Pro allows up to 5h). */
const JOB_SANDBOX_EXTEND_MS = 90 * 60 * 1000;
const CREATE_WALL_CLOCK_MS = 75 * 60 * 1000;
const EDIT_WALL_CLOCK_MS = 25 * 60 * 1000;
/** Consider the builder dead if the process is gone and no terminal event arrived. */
const STALL_GRACE_MS = 3 * 60 * 1000;

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
): Promise<void> {
  const tip = await inspectProjectDraftTip({
    projectId: job.projectId,
    workspaceId: job.workspaceId,
    maxPaths: 2000,
  });
  const have = new Set(tip.paths);
  const skeleton = bootSkeletonFiles({ title, kind });
  // Only fill gaps — never clobber existing work (edit mode, or a retried create).
  const missing = skeleton.filter((f) => !have.has(f.path));
  const mustHave = ["package.json", "app/layout.tsx", "app/page.tsx", "app/globals.css"];
  const needsCommit =
    !tip.draftSha || mustHave.some((p) => !have.has(p)) || (job.facts.mode === "create" && missing.length > 0);
  if (!needsCommit) return;
  await commitFilesToDraftBranch({
    projectId: job.projectId,
    workspaceId: job.workspaceId,
    message: "Cander: boot skeleton for website build",
    files: missing.map((f) => ({ path: f.path, content: f.content })),
  });
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
    .select("name, title, kind, cander_subdomain, custom_domain, published_url")
    .eq("id", job.projectId)
    .maybeSingle();
  const projectName = String(project?.name ?? project?.title ?? job.title ?? "New site");
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
    progressNote: "Preparing your workspace…",
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
    await ensureBootSkeleton(job, projectName, projectKind);

    const sandbox = await ensureProjectSandbox({
      userId,
      projectId: job.projectId,
      workspaceId: job.workspaceId,
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

    const config = {
      jobId: job.id,
      projectId: job.projectId,
      workspaceId: job.workspaceId,
      mode: job.facts.mode,
      projectKind,
      projectName,
      siteUrl,
      brief: job.facts.brief ?? null,
      instruction: job.facts.instruction ?? null,
      apiBase,
      transport,
      twentyFirstEnabled,
      webSearch: isOpenAIWebSearchEnabled(),
      models,
      reasoning: process.env.CANDER_BUILDER_REASONING?.trim() || "medium",
      devServerUrl: `http://localhost:${BUILD_APP_PORT}`,
      budget: {
        wallClockMs: job.facts.mode === "create" ? CREATE_WALL_CLOCK_MS : EDIT_WALL_CLOCK_MS,
      },
    };

    const sources = await readBuilderSources();
    await sb.writeFiles([
      ...sources.map((f) => ({ path: `${repoDir}/${f.path}`, content: f.content })),
      { path: `${jobDir}/config.json`, content: JSON.stringify(config, null, 2) },
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
      progressNote: projectKind === "app" ? "Drafting your app…" : "Drafting your website…",
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
    await failBuildJob(job, `Could not start the builder: ${message}`);
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

async function pullAndProcess(job: BuildJob): Promise<BuildJob> {
  const sessionId = job.facts.sessionId;
  const userId = job.facts.userId;
  if (!sessionId) return job;

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
      return (await failBuildJob(job, `The build environment stopped before finishing (${message}).`)) ?? job;
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
    current =
      (await updateBuildJob(job.id, {
        progressNote: lastProgress?.message ?? job.progressNote,
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
    return (await failBuildJob(current, failed.message || "Builder failed.")) ?? current;
  }

  // Dead process without a terminal event → fail after a short grace period
  // (the final flush may still be landing).
  if (!alive && !hasResult) {
    const lastAt = Date.parse(current.facts.lastEventAt || current.facts.startedAt || current.createdAt);
    if (Date.now() - lastAt > STALL_GRACE_MS) {
      const tail = meta.split("\n").slice(-12).join("\n").trim();
      return (
        (await failBuildJob(
          current,
          `The builder process exited unexpectedly.${tail ? `\n${tail.slice(0, 800)}` : ""}`,
        )) ?? current
      );
    }
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
    else if (m.startsWith("verifying")) phase = "validating";
  }
  return phase;
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
  const updated =
    (await updateBuildJob(job.id, {
      progressNote: lastProgress?.message ?? job.progressNote,
      facts: {
        eventSeq: Math.max(job.facts.eventSeq ?? 0, ...clean.map((e) => e.seq)),
        lastEventAt: new Date().toISOString(),
      },
    })) ?? job;
  const finished = clean.find((e) => e.kind === "finished");
  const failed = clean.find((e) => e.kind === "failed");
  if (finished) await completeBuildJob(updated, finished);
  else if (failed) await failBuildJob(updated, failed.message || "Builder failed.");
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
    progressNote: "Saving your draft…",
  });
  if (!won) return getBuildJob(job.id);

  const sessionId = job.facts.sessionId;
  const userId = job.facts.userId;
  const summary =
    (finished.payload?.summary as string | undefined) || finished.message || "Draft updated.";
  const partial = Boolean(finished.payload?.partial);

  try {
    if (!sessionId) throw new Error("job has no sandbox session");
    await appendBuildJobEvents(job.id, [
      { seq: 100000, kind: "status", message: "Saving your draft", payload: { server: true } },
    ]);
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
      await appendBuildJobEvents(job.id, [
        { seq: 100002, kind: "status", message: "Starting the preview", payload: { server: true } },
      ]);
      const ready = await finalizeBuildReady({
        userId,
        projectId: job.projectId,
        workspaceId: job.workspaceId,
      });
      if (!ready.ok) {
        throw new Error(ready.reason || "Preview did not become ready.");
      }
      draftSha = ready.draftSha ?? draftSha;
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
      { seq: 100003, kind: "status", message: "Draft ready", payload: { server: true, draftSha } },
    ]);
    const done = await updateBuildJob(job.id, {
      status: "ready_for_review",
      progressNote: partial ? "Draft ready (partial)" : "Draft ready",
      resultSummary: summary,
      facts: {
        finishedAt: new Date().toISOString(),
        draftSha,
        summary,
      },
    });
    console.info(LOG, "ready", { jobId: job.id, draftSha });
    await startNextQueuedJob(job);
    return done;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failBuildJob({ ...job, status: "verifying" }, message);
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

async function failBuildJob(job: BuildJob, error: string): Promise<BuildJob | null> {
  console.warn(LOG, "failed", { jobId: job.id, error: error.slice(0, 300) });
  await appendBuildJobEvents(job.id, [
    { seq: 100009, kind: "failed", message: error.slice(0, 2000), payload: { server: true } },
  ]);
  if (job.facts.mode === "create") {
    // A failed edit leaves the (still working) draft alone — only creates
    // flip the project into the failed state.
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
          validationIssues: [error.slice(0, 500)],
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
    resultSummary: error.slice(0, 2000),
    facts: { finishedAt: new Date().toISOString(), error: error.slice(0, 2000) },
  });
  await startNextQueuedJob(job);
  return failed;
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
