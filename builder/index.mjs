#!/usr/bin/env node
// Cander Builder — runs INSIDE the project's Vercel Sandbox as a detached
// process. Cander's server uploads this directory + a config.json, starts
// `node .cander/builder/index.mjs --job <id>`, and pulls events.jsonl.
//
// Usage: node index.mjs --job <jobId> [--config <path>]

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { EventLog } from "./events.mjs";
import { LlmClient } from "./llm.mjs";
import { PreviewSupervisor } from "./preview.mjs";
import { SandboxTools, execShell } from "./tools.mjs";
import { TwentyFirstClient } from "./twenty-first.mjs";
import { runAgent } from "./agent.mjs";
import { runAcceptance } from "./verify.mjs";
import {
  createInstructions,
  createTask,
  editInstructions,
  editTask,
  STACK_RULES,
  WORKFLOW_REPAIR,
} from "./prompts.mjs";
import { runPlanningPhase } from "./planner.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const jobId = arg("job");
  if (!jobId) throw new Error("--job <id> required");
  const repoDir = resolve(arg("repo", process.cwd()));
  const jobDir = join(repoDir, ".cander", "jobs", jobId);
  const configPath = arg("config", join(jobDir, "config.json"));
  if (!existsSync(configPath)) throw new Error(`config not found: ${configPath}`);
  const config = JSON.parse(readFileSync(configPath, "utf8"));

  writeFileSync(join(jobDir, "pid"), String(process.pid));

  const log = new EventLog({
    file: join(jobDir, "events.jsonl"),
    apiBase: config.apiBase,
    jobId,
    token: process.env.CANDER_JOB_TOKEN || null,
  });

  const finishFile = (status, extra) => {
    try {
      writeFileSync(
        join(jobDir, "result.json"),
        JSON.stringify({ status, at: new Date().toISOString(), ...extra }, null, 2),
      );
    } catch {
      /* ignore */
    }
  };

  process.on("uncaughtException", (err) => {
    log.emit("failed", `Builder crashed: ${err?.message || err}`, { stack: String(err?.stack || "").slice(0, 2000) });
    finishFile("failed", { error: String(err?.message || err) });
    void log.close().finally(() => process.exit(1));
  });
  process.on("unhandledRejection", (err) => {
    log.emit("failed", `Builder crashed: ${err?.message || err}`, { stack: String(err?.stack || "").slice(0, 2000) });
    finishFile("failed", { error: String(err?.message || err) });
    void log.close().finally(() => process.exit(1));
  });

  const transport = config.transport === "direct" ? "direct" : "proxy";
  const token = process.env.CANDER_JOB_TOKEN || null;
  const llm = new LlmClient({ transport, apiBase: config.apiBase, jobId, token, log });
  const twentyFirst = TwentyFirstClient.available({
    transport,
    apiBase: config.apiBase,
    token,
    twentyFirstEnabled: Boolean(config.twentyFirstEnabled),
  })
    ? new TwentyFirstClient({ transport, apiBase: config.apiBase, jobId, token, log })
    : null;
  const devServerUrl = config.devServerUrl || "http://localhost:3000";
  const preview = new PreviewSupervisor({ repoDir, devServerUrl, log });
  const provider =
    transport === "proxy" && config.apiBase && token ? { apiBase: config.apiBase, jobId, token } : null;
  const tools = new SandboxTools({ repoDir, devServerUrl, log, twentyFirst, preview, provider });

  const mode = config.mode === "edit" ? "edit" : "create";
  const projectKind = config.projectKind === "app" ? "app" : "site";
  // Retry of a failed create: resume from the last good phase in the SAME
  // sandbox (files, plan and logs are still here) instead of starting over.
  const resume = normalizeResume(config.resume, repoDir);
  const models = {
    planner: config.models?.planner || "gpt-5.6-luna",
    coder: config.models?.coder || "gpt-5.3-codex",
  };
  const budget = {
    deadlineMs: Date.now() + Number(config.budget?.wallClockMs || (mode === "create" ? 75 : 25) * 60_000),
    maxLlmCalls: Number(config.budget?.maxLlmCalls || (mode === "create" ? 400 : 120)),
    // Guardrail against tool-call loops (a model re-reading the same files forever).
    maxToolCalls: Number(config.budget?.maxToolCalls || (mode === "create" ? 1500 : 400)),
  };

  log.emit(
    "status",
    mode === "create"
      ? projectKind === "app"
        ? "Drafting your app"
        : "Drafting your website"
      : "Working on your change",
    {
      mode,
      projectKind,
      models,
      transport,
      twentyFirst: Boolean(twentyFirst),
    },
  );

  // ---- phase: workspace / preview -------------------------------------------
  // Edits need the live preview immediately (HMR-driven verification). Creates
  // write most files first, so the preview only has to be up by acceptance:
  // bring it up in the background while planning runs.
  let previewBoot;
  if (mode === "edit") {
    const up = await waitForDevServer(devServerUrl, log, 90_000);
    previewBoot = up ? Promise.resolve(preview.last) : preview.ensure({ reason: "edit_start" });
  } else {
    previewBoot = (async () => {
      const up = await waitForDevServer(devServerUrl, log, 12_000);
      return up ? preview.last : preview.ensure({ reason: "create_start" });
    })();
  }
  previewBoot = previewBoot.catch((err) => {
    log.emit("log", `Preview boot failed: ${err?.message || err}`);
    return null;
  });

  // ---- phase: plan (create only; reused on resume) ----------------------------
  let plan = null;
  if (mode === "create" && resume?.plan) {
    plan = resume.plan;
    log.emit("plan", "Reusing the plan from the previous attempt", { resumed: true, chars: plan.markdown.length });
  } else if (mode === "create" && resume?.phase !== "verify") {
    try {
      plan = await runPlanningPhase({
        llm,
        log,
        model: models.planner,
        projectKind,
        projectName: config.projectName,
        siteUrl: config.siteUrl || null,
        brief: config.brief || null,
        projectSpec: config.projectSpec || null,
        instruction: config.instruction || null,
        twentyFirst,
        webSearch: Boolean(config.webSearch),
        deadlineMs: budget.deadlineMs,
      });
    } catch (err) {
      log.emit("log", `Planning skipped: ${err?.message || err}`);
    }
  }
  if (plan?.markdown) {
    // Durable in the sandbox so a retry can skip planning.
    try {
      writeFileSync(join(jobDir, "plan.md"), plan.markdown);
      writeFileSync(join(jobDir, "plan.json"), JSON.stringify({ routes: plan.routes || [] }));
    } catch {
      /* best-effort */
    }
  }

  // ---- acceptance ------------------------------------------------------------
  let lastVerification = null;
  const acceptance = async (finish) => {
    log.emit("status", projectKind === "app" ? "Verifying the app" : "Verifying the site", { routes: finish.routes });
    const result = await runAcceptance({
      repoDir,
      devServerUrl,
      log,
      preview,
      routes: finish.routes,
      expectedRoutes: plan?.routes || resume?.routes || [],
      mode,
      projectKind,
      siteUrl: config.siteUrl || null,
      features: Array.isArray(config.projectSpec?.features) ? config.projectSpec.features : [],
      // Edits: browser-test only what changed (page files → routes, else the
      // routes the agent reported).
      scopeRoutes: mode === "edit" ? routesFromWrittenPaths([...tools.writtenPaths], finish.routes) : null,
      functional: config.functionalChecks !== false,
      productionBuild: config.productionBuild !== false,
      deadlineMs: budget.deadlineMs,
      writtenPaths: mode === "edit" ? [...tools.writtenPaths] : null,
      tools,
    });
    lastVerification = result;
    try {
      writeFileSync(join(jobDir, "verify-report.txt"), result.report);
    } catch {
      /* best-effort */
    }
    if (result.ok) return { accept: true };
    if (result.classification === "preview_unavailable") {
      // Not the coder's problem: accept unverified and let the server recover.
      return { accept: false, infra: true, classification: "preview_unavailable", feedback: result.report };
    }
    return { accept: false, feedback: result.report, classification: "app" };
  };

  const ctx = {
    projectKind,
    projectName: config.projectName || "",
    siteUrl: config.siteUrl || null,
    brief: config.brief || null,
    projectSpec: config.projectSpec || null,
    instruction: config.instruction || null,
    conversation: config.conversation || null,
    condensedContext: config.condensedContext || null,
    routeMap: config.routeMap || null,
    runtimeContext: config.runtimeContext || null,
    plan: plan?.markdown || null,
  };

  // Make sure the preview boot finished (or gave up) before the coder starts
  // checking routes; planning usually covers the whole boot time.
  const boot = await previewBoot;
  if (boot && !boot.ok) {
    log.emit("log", `Preview not up at build start (${boot.cause}); coder proceeds, recovery continues on demand.`, {
      cause: boot.cause,
      kind: boot.kind,
    });
  }

  // ---- phase: build -----------------------------------------------------------
  let result;
  if (mode === "create" && resume?.phase === "verify") {
    // Files already exist from the previous attempt: verify first, code only
    // if verification actually finds application problems.
    log.emit("status", "Checking the previous draft", { resumed: true });
    const routes = resume.routes?.length ? resume.routes : [];
    const verdict = await acceptance({ summary: resume.summary || "", routes });
    if (verdict.accept) {
      result = {
        finished: true,
        summary: resume.summary || "Your draft is ready.",
        routes: lastVerification?.routes || routes,
        reason: "finished",
        lastText: "",
      };
    } else if (verdict.infra) {
      result = {
        finished: true,
        summary: resume.summary || "Your draft is ready.",
        routes,
        reason: "finished_unverified",
        lastText: verdict.feedback || "",
        unverified: true,
        classification: "preview_unavailable",
      };
    } else {
      result = {
        finished: false,
        summary: resume.summary || "",
        routes: lastVerification?.routes || routes,
        reason: "verification_failed",
        lastText: verdict.feedback || "",
      };
      // Mark something as written so the repair round below runs.
      tools.writtenPaths.add(".cander/resume");
    }
  } else {
    log.emit(
      "status",
      mode === "create"
        ? projectKind === "app"
          ? "Building screens and data layer"
          : "Building pages and components"
        : "Making the change",
    );
    result = await runAgent({
      llm,
      tools,
      log,
      model: models.coder,
      reasoning: config.reasoning || "medium",
      instructions: mode === "create" ? createInstructions(ctx) : editInstructions(ctx),
      task: mode === "create" ? createTask(ctx) : editTask({ ...ctx, instruction: config.instruction || "" }),
      budget,
      onFinishRequested: acceptance,
      label: "coder",
    });
  }

  // ---- phase: repair (bounded; application failures only) --------------------
  // Verification failures after finish() are usually a handful of type errors
  // or one route that 500s. Grant a short, fresh-context repair pass with the
  // concrete report. Infrastructure failures never reach the coder.
  // Resumed verify→repair jobs need a larger budget: the first verify already
  // spent the "easy" installs, and cutting at 40 calls discarded a working fix.
  if (!result.finished && result.reason === "verification_failed" && tools.writtenPaths.size > 0) {
    log.emit("status", "Repairing build", { repair: true, resumed: Boolean(resume) });
    const repairBudget = {
      deadlineMs: Math.max(budget.deadlineMs, Date.now()) + Number(config.budget?.repairMs || (resume ? 12 : 8) * 60_000),
      maxLlmCalls: Number(config.budget?.repairLlmCalls || (resume ? 80 : 40)),
      maxToolCalls: Number(config.budget?.repairToolCalls || (resume ? 200 : 120)),
    };
    const repair = await runAgent({
      llm,
      tools,
      log,
      model: models.coder,
      reasoning: "medium",
      instructions: [
        `You are Cander Builder — an autonomous senior front-end engineer fixing a Next.js repo so it passes verification.`,
        STACK_RULES,
        WORKFLOW_REPAIR,
      ].join("\n\n"),
      task: [
        `Project: ${config.projectName || "Untitled"}`,
        `Routes that must render: ${(result.routes || []).join(", ") || "(see report)"}`,
        `Verification report:\n${(result.lastText || "").slice(0, 6000)}`,
        "Fix these problems now, re-run tsc and check_preview, then call finish.",
      ].join("\n\n"),
      budget: repairBudget,
      onFinishRequested: acceptance,
      label: "repair",
    });
    if (repair.finished) {
      result = { ...repair, summary: result.summary || repair.summary };
    } else {
      // Prefer the freshest acceptance report over the pre-repair snapshot
      // (resume verify often reports a problem the repair already fixed).
      const latestText =
        (lastVerification && !lastVerification.ok && lastVerification.report) ||
        repair.lastText ||
        result.lastText ||
        "";
      const budgetish =
        repair.reason === "deadline" ||
        repair.reason === "llm_budget" ||
        repair.reason === "tool_budget";
      result = {
        ...result,
        reason:
          repair.reason === "preview_unavailable" || budgetish
            ? repair.reason
            : result.reason,
        lastText: latestText,
        routes: lastVerification?.routes || repair.routes || result.routes,
      };
    }
  }

  // Count writes AFTER repair so resumed verify→repair jobs that only touch
  // files in the repair pass still persist / hand off a partial draft.
  const realWrites = [...tools.writtenPaths].filter((p) => !p.startsWith(".cander/")).length;

  // The coder gave up because the preview was down (not because of its code):
  // that is a handoff, not a failure, as long as there is a draft to hand over.
  if (!result.finished && result.reason === "preview_unavailable" && realWrites > 0) {
    result = {
      ...result,
      finished: true,
      reason: "finished_unverified",
      unverified: true,
      classification: "preview_unavailable",
      summary:
        result.summary?.slice(0, 600) ||
        (projectKind === "app" ? "Your app draft is ready." : "Your website draft is ready."),
    };
  }

  const stats = {
    llmCalls: llm.calls,
    inputTokens: llm.inputTokens,
    outputTokens: llm.outputTokens,
    toolCalls: tools.toolCalls,
    filesTouched: realWrites,
  };
  const recovery = preview.summary();
  const files = [...tools.writtenPaths].filter((p) => !p.startsWith(".cander/")).slice(0, 200);

  if (result.finished) {
    const unverified = Boolean(result.unverified);
    // True only when the last acceptance ran `next build` successfully on the
    // tree being handed over — publish can then deploy without rebuilding.
    const buildVerified = Boolean(!unverified && lastVerification?.ok && lastVerification?.buildVerified);
    log.emit("finished", result.summary || "Done", {
      summary: result.summary,
      routes: result.routes,
      files,
      stats,
      buildVerified,
      ...(unverified
        ? {
            partial: true,
            unverified: true,
            classification: result.classification || "preview_unavailable",
            cause: recovery.last?.cause || null,
            verification: (result.lastText || "").slice(0, 3000),
            recovery,
          }
        : {}),
    });
    finishFile("finished", { summary: result.summary, routes: result.routes, stats, unverified, recovery });
  } else if (realWrites > 0 && result.reason !== "verification_failed") {
    // Budget ran out but work exists — hand it over as a partial draft so the
    // user sees something and can iterate, instead of losing everything.
    // The last edits may postdate the last acceptance run: typecheck the tree
    // as it stands so a broken handoff is marked unverified (publish preflight
    // then rebuilds instead of trusting "ready").
    const partialCheck = await quickTypecheck(repoDir, log);
    const summary =
      result.lastText?.slice(0, 600) ||
      "I ran out of time before finishing every check, but the draft is in place — tell me what to fix next.";
    log.emit("finished", summary, {
      summary,
      routes: result.routes,
      partial: true,
      reason: result.reason,
      files,
      stats,
      recovery,
      ...(partialCheck.ok
        ? {}
        : {
            unverified: true,
            classification: "app",
            verification: partialCheck.report.slice(0, 3000),
          }),
    });
    finishFile("finished", { summary, partial: true, reason: result.reason, stats, unverified: !partialCheck.ok });
  } else {
    const classification = classifyFailure(result.reason, recovery);
    const message =
      result.reason === "verification_failed"
        ? `The site did not pass verification:\n${result.lastText?.slice(0, 1500) || ""}`
        : `Builder stopped (${result.reason}).${result.lastText ? ` ${result.lastText.slice(0, 500)}` : ""}`;
    log.emit("failed", message, {
      reason: result.reason,
      classification,
      cause: recovery.last?.cause || null,
      diagnostics: (recovery.last?.detail || result.lastText || "").slice(0, 1500),
      recovery,
      routes: result.routes,
      files,
      stats,
      verification: lastVerification ? lastVerification.report.slice(0, 3000) : null,
    });
    finishFile("failed", { error: message, reason: result.reason, classification, stats, recovery });
  }

  await log.close();
  process.exit(0);
}

/**
 * Cheap tsc on the current tree for partial handoffs. Never throws; a missing
 * tsconfig/typescript counts as ok (nothing to check).
 */
async function quickTypecheck(repoDir, log) {
  if (!existsSync(join(repoDir, "tsconfig.json"))) return { ok: true, report: "" };
  try {
    log.emit("verify", "Typechecking the partial draft (tsc --noEmit)…");
    const tsc = await execShell("npx --no-install tsc --noEmit --pretty false --skipLibCheck", {
      cwd: repoDir,
      timeoutMs: 180_000,
    });
    if (tsc.exitCode === 0) return { ok: true, report: "" };
    if (/Cannot find module 'typescript'|not found/i.test(tsc.stderr || "")) return { ok: true, report: "" };
    const lines = `${tsc.stdout}\n${tsc.stderr}`
      .split("\n")
      .filter((l) => /error TS\d+/.test(l))
      .slice(0, 25);
    const report = lines.length ? `TypeScript errors:\n${lines.join("\n")}` : `tsc exited ${tsc.exitCode}`;
    log.emit("verify", `Partial draft has type errors (${lines.length || "?"}); handing off unverified.`);
    return { ok: false, report };
  } catch (err) {
    log.emit("log", `Partial typecheck skipped: ${err?.message || err}`);
    return { ok: true, report: "" };
  }
}

/**
 * Root-cause bucket for a failed run. `infra` = environment/runtime, `app` =
 * generated code failed checks, `budget` = out of time/calls, `agent` = the
 * model stopped cooperating.
 */
function classifyFailure(reason, recovery) {
  if (reason === "preview_unavailable") return "infra";
  if (reason === "verification_failed") {
    return recovery?.last && recovery.last.ok === false && recovery.last.kind === "infra" ? "infra" : "app";
  }
  if (reason === "deadline" || reason === "llm_budget" || reason === "tool_budget") return "budget";
  if (reason === "no_tool_calls") return "agent";
  return "unknown";
}

/**
 * @param {unknown} raw config.resume from the server
 * @param {string} repoDir
 * @returns {{ fromJobId: string, phase: "build"|"verify", plan: { markdown: string, routes: string[] }|null, routes: string[], summary: string|null, report: string|null }|null}
 */
function normalizeResume(raw, repoDir) {
  if (!raw || typeof raw !== "object" || !raw.fromJobId) return null;
  const fromJobId = String(raw.fromJobId);
  const prevDir = join(repoDir, ".cander", "jobs", fromJobId);
  const read = (name) => {
    try {
      const p = join(prevDir, name);
      return existsSync(p) ? readFileSync(p, "utf8") : null;
    } catch {
      return null;
    }
  };
  const planMd = read("plan.md");
  let routes = [];
  try {
    const j = JSON.parse(read("plan.json") || "{}");
    if (Array.isArray(j.routes)) routes = j.routes.map(String);
  } catch {
    /* ignore */
  }
  if (Array.isArray(raw.routes) && raw.routes.length) routes = raw.routes.map(String);
  return {
    fromJobId,
    phase: raw.phase === "verify" ? "verify" : "build",
    plan: planMd ? { markdown: planMd, routes } : null,
    routes,
    summary: typeof raw.summary === "string" ? raw.summary : null,
    report: read("verify-report.txt") || (typeof raw.report === "string" ? raw.report : null),
  };
}

function routesFromWrittenPaths(paths, fallback) {
  const routes = new Set();
  for (const p of paths) {
    const m = p.match(/^app\/(.*?)(?:\/)?page\.(tsx|jsx|ts|js|mdx)$/);
    if (!m) continue;
    const segs = m[1]
      .split("/")
      .filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@"));
    routes.add(`/${segs.join("/")}`.replace(/\/+$/, "") || "/");
  }
  if (!routes.size) for (const r of fallback || []) routes.add(r);
  if (!routes.size) routes.add("/");
  return [...routes];
}

async function waitForDevServer(url, log, maxMs = 180_000) {
  const started = Date.now();
  let announced = false;
  while (Date.now() - started < maxMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.status > 0) return true;
    } catch {
      /* not up yet */
    }
    if (!announced) {
      log.emit("progress", "Getting your workspace ready…");
      announced = true;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  log.emit("log", "Dev server did not answer in time; continuing anyway.");
  return false;
}

main().catch(async (err) => {
  process.stderr.write(`[builder] fatal: ${err?.stack || err}\n`);
  process.exit(1);
});
