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
import { SandboxTools } from "./tools.mjs";
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
  const tools = new SandboxTools({ repoDir, devServerUrl, log, twentyFirst });

  const mode = config.mode === "edit" ? "edit" : "create";
  const projectKind = config.projectKind === "app" ? "app" : "site";
  const models = {
    planner: config.models?.planner || "gpt-5.6-luna",
    coder: config.models?.coder || "gpt-5.3-codex",
  };
  const budget = {
    deadlineMs: Date.now() + Number(config.budget?.wallClockMs || (mode === "create" ? 75 : 25) * 60_000),
    maxLlmCalls: Number(config.budget?.maxLlmCalls || (mode === "create" ? 400 : 120)),
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

  // Edits need the live preview immediately. Creates do most writing first and
  // accept at the end — only wait briefly so a cold sandbox doesn't burn 3 min.
  await waitForDevServer(devServerUrl, log, mode === "create" ? 12_000 : 180_000);

  // ---- plan (create only) ----------------------------------------------------
  let plan = null;
  if (mode === "create") {
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

  // ---- build -----------------------------------------------------------------
  const acceptance = async (finish) => {
    log.emit("status", projectKind === "app" ? "Verifying the app" : "Verifying the site", { routes: finish.routes });
    const result = await runAcceptance({
      repoDir,
      devServerUrl,
      log,
      routes: finish.routes,
      expectedRoutes: plan?.routes || [],
      mode,
      projectKind,
      siteUrl: config.siteUrl || null,
      features: Array.isArray(config.projectSpec?.features) ? config.projectSpec.features : [],
      // Edits: browser-test only what changed (page files → routes, else the
      // routes the agent reported).
      scopeRoutes: mode === "edit" ? routesFromWrittenPaths([...tools.writtenPaths], finish.routes) : null,
      functional: config.functionalChecks !== false,
      deadlineMs: budget.deadlineMs,
      writtenPaths: mode === "edit" ? [...tools.writtenPaths] : null,
    });
    return result.ok
      ? { accept: true }
      : { accept: false, feedback: result.report };
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
    plan: plan?.markdown || null,
  };

  log.emit(
    "status",
    mode === "create"
      ? projectKind === "app"
        ? "Building screens and data layer"
        : "Building pages and components"
      : "Making the change",
  );
  let result = await runAgent({
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

  // ---- one bounded self-repair round -----------------------------------------
  // Verification failures after finish() are usually a handful of type errors
  // or one route that 500s. Instead of surfacing "Retry" to the user, grant a
  // short, fresh-context repair pass with the concrete report before failing.
  if (!result.finished && result.reason === "verification_failed" && tools.writtenPaths.size > 0) {
    log.emit("status", "Fixing verification issues", { repair: true });
    const repairBudget = {
      deadlineMs: Math.max(budget.deadlineMs, Date.now()) + Number(config.budget?.repairMs || 8 * 60_000),
      maxLlmCalls: Number(config.budget?.repairLlmCalls || 40),
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
      result = { ...result, lastText: repair.lastText || result.lastText };
    }
  }

  const stats = {
    llmCalls: llm.calls,
    inputTokens: llm.inputTokens,
    outputTokens: llm.outputTokens,
    toolCalls: tools.toolCalls,
    filesTouched: tools.writtenPaths.size,
  };

  if (result.finished) {
    log.emit("finished", result.summary || "Done", {
      summary: result.summary,
      routes: result.routes,
      files: [...tools.writtenPaths].slice(0, 200),
      stats,
    });
    finishFile("finished", { summary: result.summary, routes: result.routes, stats });
  } else if (tools.writtenPaths.size > 0 && result.reason !== "verification_failed") {
    // Budget ran out but work exists — hand it over as a partial draft so the
    // user sees something and can iterate, instead of losing everything.
    const summary =
      result.lastText?.slice(0, 600) ||
      "I ran out of time before finishing every check, but the draft is in place — tell me what to fix next.";
    log.emit("finished", summary, {
      summary,
      routes: result.routes,
      partial: true,
      reason: result.reason,
      files: [...tools.writtenPaths].slice(0, 200),
      stats,
    });
    finishFile("finished", { summary, partial: true, reason: result.reason, stats });
  } else {
    const message =
      result.reason === "verification_failed"
        ? `The site did not pass verification:\n${result.lastText?.slice(0, 1500) || ""}`
        : `Builder stopped (${result.reason}).${result.lastText ? ` ${result.lastText.slice(0, 500)}` : ""}`;
    log.emit("failed", message, { reason: result.reason, stats });
    finishFile("failed", { error: message, reason: result.reason, stats });
  }

  await log.close();
  process.exit(0);
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
