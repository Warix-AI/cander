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

  // Wait for the dev server so check_preview works from the first call.
  await waitForDevServer(devServerUrl, log);

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
        brief: config.brief || null,
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
    });
    return result.ok
      ? { accept: true }
      : { accept: false, feedback: result.report };
  };

  const ctx = {
    projectKind,
    projectName: config.projectName || "",
    brief: config.brief || null,
    instruction: config.instruction || null,
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
  const result = await runAgent({
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
      log.emit("progress", "Waiting for the dev server…");
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
