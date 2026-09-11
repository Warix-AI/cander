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
import { runAgent, normalizeAgentReason } from "./agent.mjs";
import { runAcceptance } from "./verify.mjs";
import { auditUiSource } from "./ui-source.mjs";
import {
  createInstructions,
  createTask,
  editInstructions,
  editTask,
  STACK_RULES,
  WORKFLOW_REPAIR,
  WORKFLOW_DESIGN_REPAIR,
} from "./prompts.mjs";
import { runPlanningPhase } from "./planner.mjs";
import { captureVisualEvidence, runVisualQa, writeVisualReport } from "./visual-qa.mjs";

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
  const flags = {
    improved: config.flags?.improved !== false,
    twentyFirstFetch: config.flags?.twentyFirstFetch !== false,
    websiteTemplateFirst: config.flags?.websiteTemplateFirst !== false,
    allowNativeSiteUi: config.flags?.allowNativeSiteUi === true,
    visualQa: config.flags?.visualQa !== false,
    sdkOwnedLoop: config.flags?.sdkOwnedLoop !== false,
    continuousRepair: config.flags?.continuousRepair !== false,
    modelRouting: config.flags?.modelRouting !== false,
  };
  const models = {
    planner: config.models?.planner || "gpt-5.6-luna",
    fast: config.models?.fast || config.models?.planner || "gpt-5.6-luna",
    coder: config.models?.coder || "gpt-5.3-codex",
    strongCoder: config.models?.strongCoder || config.models?.coder || "gpt-5.3-codex",
    visualReview: config.models?.visualReview || config.models?.planner || "gpt-5.6-luna",
  };
  const editComplexity = config.editComplexity || "standard";
  const coderModel =
    config.coderModel ||
    (flags.modelRouting
      ? mode === "edit" && editComplexity === "trivial"
        ? models.fast
        : mode === "create" && projectKind === "app"
          ? models.strongCoder
          : mode === "edit" && editComplexity === "complex"
            ? models.strongCoder
            : models.coder
      : models.coder);
  const budget = {
    deadlineMs: Date.now() + Number(config.budget?.wallClockMs || (mode === "create" ? 75 : 25) * 60_000),
    maxLlmCalls: Number(config.budget?.maxLlmCalls || (mode === "create" ? 400 : 120)),
    // Guardrail against tool-call loops (a model re-reading the same files forever).
    maxToolCalls: Number(config.budget?.maxToolCalls || (mode === "create" ? 1500 : 400)),
  };
  const jobAbort = new AbortController();
  const metrics = {
    modelsUsed: /** @type {string[]} */ ([]),
    planningCalls: 0,
    coderCalls: 0,
    repairCalls: 0,
    visualQaAttempts: 0,
    twentyFirstSearches: 0,
    twentyFirstFetches: 0,
    templateSearches: 0,
    templateFetches: 0,
    templateSelected: 0,
    templateUsed: false,
    templateFetched: false,
    templateInstalled: false,
    templateRendered: false,
    nativeUiUsed: false,
    uiSourceAcceptancePassed: false,
    componentsSelected: 0,
    acceptanceAttempts: 0,
    previewRestarts: 0,
    startedAt: Date.now(),
  };
  const noteModel = (m) => {
    if (m && !metrics.modelsUsed.includes(m)) metrics.modelsUsed.push(m);
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
      flags,
      coderModel,
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
  /** @type {Array<Record<string, unknown>>} */
  let selectedComponents = [];
  let designDirection = "";
  if (mode === "create" && resume?.plan) {
    plan = resume.plan;
    log.emit("plan", "Reusing the plan from the previous attempt", { resumed: true, chars: plan.markdown.length });
  } else if (mode === "create" && resume?.phase !== "verify") {
    try {
      noteModel(models.planner);
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
        repoDir,
        fetchComponents: flags.twentyFirstFetch,
        templateFirst: flags.websiteTemplateFirst && projectKind === "site",
        allowNativeSiteUi: flags.allowNativeSiteUi,
      });
      metrics.planningCalls += 1;
      if (plan?.abort) {
        const reason = plan.abortReason || "ui_source_unavailable";
        log.emit("progress", "Design resources are temporarily unavailable. Try again.", {
          phase: "twenty_first_template",
          detail: reason,
        });
        if (plan.designSystem) {
          log.emit("spec_update", "Recorded UI source unavailability", {
            patch: { designSystem: plan.designSystem },
            decision: `Website CREATE aborted — ${reason}`,
          });
        }
        const message =
          "Design resources are temporarily unavailable. Try again.";
        log.emit("failed", message, {
          reason,
          classification: "infra",
          stats: { ...metrics, ...(plan.stats || {}) },
        });
        finishFile("failed", { error: message, reason, stats: plan.stats || {} });
        await log.close();
        process.exit(1);
        return;
      }
      if (plan?.selectedComponents?.length) {
        selectedComponents = plan.selectedComponents;
        metrics.componentsSelected = selectedComponents.length;
      }
      if (plan?.stats) {
        metrics.twentyFirstSearches = Number(plan.stats.searches || 0) + Number(plan.stats.templateSearches || 0);
        metrics.twentyFirstFetches = Number(plan.stats.fetches || 0) + Number(plan.stats.templateFetches || 0);
        metrics.templateSearches = Number(plan.stats.templateSearches || 0);
        metrics.templateFetches = Number(plan.stats.templateFetches || 0);
        metrics.templateSelected = Number(plan.stats.templateSelected || 0);
        metrics.templateUsed = Boolean(plan.stats.templateUsed);
        metrics.templateFetched = Boolean(plan.stats.templateFetched);
        metrics.templateInstalled = Boolean(plan.stats.templateInstalled);
        metrics.nativeUiUsed = Boolean(plan.stats.nativeUiUsed);
      }
      if (plan?.designDirection) designDirection = plan.designDirection;
      const specPatch = {};
      if (selectedComponents.length) {
        specPatch.selectedComponents = selectedComponents.map((c) => ({
          source: c.source || "21st",
          componentId: c.componentId,
          name: c.name,
          purpose: c.purpose,
          reason: c.reason,
          localPath: c.localPath,
          adaptationInstructions: c.adaptationInstructions,
        }));
      }
      if (plan?.designSystem) {
        specPatch.designSystem = plan.designSystem;
      }
      if (Object.keys(specPatch).length) {
        log.emit("spec_update", "Recorded design lineage", {
          patch: specPatch,
          decision: plan?.selectedTemplate
            ? `Selected 21st template ${plan.selectedTemplate.name || plan.selectedTemplate.componentId} as visual foundation`
            : selectedComponents.length
              ? `Selected ${selectedComponents.length} design component(s) from 21st.dev for adaptation`
              : "Recorded design system lineage",
        });
      }
    } catch (err) {
      log.emit("log", `Planning skipped: ${err?.message || err}`);
      if (projectKind === "site" && flags.websiteTemplateFirst && !flags.allowNativeSiteUi) {
        const message = "Design resources are temporarily unavailable. Try again.";
        log.emit("failed", message, {
          reason: "ui_source_unavailable",
          classification: "infra",
          cause: String(err?.message || err),
        });
        finishFile("failed", { error: message, reason: "ui_source_unavailable" });
        await log.close();
        process.exit(1);
        return;
      }
    }
  }
  if (
    mode === "create" &&
    projectKind === "site" &&
    flags.websiteTemplateFirst &&
    !flags.allowNativeSiteUi &&
    !plan?.selectedTemplate &&
    !resume?.plan
  ) {
    // Planning returned without a template and without an explicit abort (e.g. null).
    const message = "Design resources are temporarily unavailable. Try again.";
    log.emit("failed", message, {
      reason: "ui_source_unavailable",
      classification: "infra",
    });
    finishFile("failed", { error: message, reason: "ui_source_unavailable" });
    await log.close();
    process.exit(1);
    return;
  }
  if (plan?.markdown) {
    // Durable in the sandbox so a retry can skip planning.
    try {
      writeFileSync(join(jobDir, "plan.md"), plan.markdown);
      writeFileSync(
        join(jobDir, "plan.json"),
        JSON.stringify({
          routes: plan.routes || [],
          selectedComponents,
          designDirection: designDirection.slice(0, 2000),
        }),
      );
    } catch {
      /* best-effort */
    }
  }

  // ---- acceptance ------------------------------------------------------------
  let lastVerification = null;
  const acceptance = async (finish) => {
    metrics.acceptanceAttempts += 1;
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

    // Website UI-source gate (CREATE): template must be installed+rendered;
    // selected 21st components must be used; no unauthorized native visuals.
    const enforceUiSource =
      projectKind === "site" &&
      flags.websiteTemplateFirst &&
      !flags.allowNativeSiteUi &&
      (mode === "create" ||
        (mode === "edit" &&
          config.projectSpec?.designSystem?.source === "21st"));
    if (enforceUiSource) {
      log.emit("progress", "Checking visual consistency…", { phase: "ui_source" });
      const isLegacyNativeSite =
        config.projectSpec?.designSystem?.source === "native" ||
        config.projectSpec?.designSystem?.source === "derived";
      const uiAudit = auditUiSource({
        repoDir,
        mode,
        projectKind,
        allowNativeSiteUi: flags.allowNativeSiteUi,
        selectedTemplate: plan?.selectedTemplate || null,
        selectedComponents,
        designSystem: plan?.designSystem || config.projectSpec?.designSystem || null,
        isLegacyNativeSite,
      });
      metrics.templateFetched = Boolean(uiAudit.metrics.templateFetched) || metrics.templateFetched;
      metrics.templateInstalled = Boolean(uiAudit.metrics.templateInstalled) || metrics.templateInstalled;
      metrics.templateRendered = Boolean(uiAudit.metrics.templateRendered);
      metrics.nativeUiUsed = Boolean(uiAudit.metrics.nativeUiUsed);
      metrics.uiSourceAcceptancePassed = uiAudit.ok;
      if (selectedComponents.length) {
        try {
          log.emit("spec_update", "Recorded 21st component usage", {
            patch: {
              selectedComponents: selectedComponents.map((c) => ({
                source: c.source || "21st",
                componentId: c.componentId,
                name: c.name,
                purpose: c.purpose,
                reason: c.reason,
                localPath: c.localPath,
                adaptationInstructions: c.adaptationInstructions,
                imported: Boolean(c.imported),
                usedInRender: Boolean(c.usedInRender),
              })),
              designBrief: {
                twentyFirstStats: {
                  searchCount: metrics.twentyFirstSearches,
                  fetchCount: metrics.twentyFirstFetches,
                  selectedIds: selectedComponents.map((c) => c.componentId),
                  componentFilesWritten: selectedComponents.map((c) => c.localPath).filter(Boolean),
                  componentFilesImported: selectedComponents.filter((c) => c.imported).map((c) => c.localPath),
                  componentFilesUsedInRender: selectedComponents
                    .filter((c) => c.usedInRender)
                    .map((c) => c.localPath),
                  templateFetched: metrics.templateFetched,
                  templateInstalled: metrics.templateInstalled,
                  templateRendered: metrics.templateRendered,
                  uiSourceAcceptancePassed: uiAudit.ok,
                  nativeUiUsed: metrics.nativeUiUsed,
                  unauthorizedVisualComponents: uiAudit.metrics.unauthorizedVisualComponents,
                },
              },
            },
          });
        } catch (err) {
          log.emit("log", `21st usage audit persist skipped: ${err?.message || err}`);
        }
      }
      if (!uiAudit.ok) {
        const uiReport = [
          result.report || "",
          "",
          "UI source issues:",
          ...uiAudit.issues.map((i) => `- ${i}`),
        ]
          .filter(Boolean)
          .join("\n");
        lastVerification = {
          ...result,
          ok: false,
          issues: [...(result.issues || []), ...uiAudit.issues],
          report: uiReport,
          classification: "app",
        };
        try {
          writeFileSync(join(jobDir, "verify-report.txt"), uiReport);
        } catch {
          /* best-effort */
        }
        if (result.classification === "preview_unavailable") {
          return { accept: false, infra: true, classification: "preview_unavailable", feedback: result.report };
        }
        return { accept: false, feedback: uiReport, classification: "app" };
      }
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
    projectSpec: config.projectSpec
      ? {
          ...config.projectSpec,
          ...(selectedComponents.length
            ? { selectedComponents: selectedComponents.map((c) => ({
                source: c.source || "21st",
                componentId: c.componentId,
                name: c.name,
                purpose: c.purpose,
                reason: c.reason,
                localPath: c.localPath,
                adaptationInstructions: c.adaptationInstructions,
              })) }
            : {}),
        }
      : null,
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
    noteModel(coderModel);
    const callsBefore = llm.calls;
    result = await runAgent({
      llm,
      tools,
      log,
      model: coderModel,
      reasoning: config.reasoning || (mode === "edit" && editComplexity === "trivial" ? "low" : "medium"),
      instructions: mode === "create" ? createInstructions(ctx) : editInstructions(ctx),
      task: mode === "create" ? createTask(ctx) : editTask({ ...ctx, instruction: config.instruction || "" }),
      budget,
      onFinishRequested: acceptance,
      label: "coder",
      sdkOwnedLoop: flags.sdkOwnedLoop,
      signal: jobAbort.signal,
    });
    metrics.coderCalls += Math.max(0, llm.calls - callsBefore);
    result = { ...result, reason: normalizeAgentReason(result.reason) };
  }

  // ---- phase: repair (bounded; application failures only) --------------------
  // Verification failures after finish() are usually a handful of type errors
  // or one route that 500s. Grant a short repair pass with the concrete report.
  // With continuousRepair, the coder already had multiple finish attempts in the
  // same conversation; this second agent is escalation with a stronger model.
  if (
    !result.finished &&
    (result.reason === "acceptance_failed" || result.reason === "verification_failed") &&
    tools.writtenPaths.size > 0
  ) {
    log.emit("status", "Repairing build", { repair: true, resumed: Boolean(resume) });
    const repairModel =
      flags.modelRouting && (metrics.acceptanceAttempts >= 2 || projectKind === "app")
        ? models.strongCoder
        : coderModel;
    noteModel(repairModel);
    const repairBudget = {
      deadlineMs: Math.max(budget.deadlineMs, Date.now()) + Number(config.budget?.repairMs || (resume ? 12 : 8) * 60_000),
      maxLlmCalls: Number(config.budget?.repairLlmCalls || (resume ? 80 : 40)),
      maxToolCalls: Number(config.budget?.repairToolCalls || (resume ? 200 : 120)),
    };
    const callsBefore = llm.calls;
    const repair = await runAgent({
      llm,
      tools,
      log,
      model: repairModel,
      reasoning: "medium",
      instructions: [
        `You are Cander Builder — an autonomous senior front-end engineer fixing a Next.js repo so it passes verification.`,
        STACK_RULES,
        WORKFLOW_REPAIR,
      ].join("\n\n"),
      task: [
        `Project: ${config.projectName || "Untitled"}`,
        `Original ${mode} task (for context — do not expand scope):\n${(config.instruction || "").slice(0, 1500) || "(create job)"}`,
        `Routes that must render: ${(result.routes || []).join(", ") || "(see report)"}`,
        `Files touched this job: ${[...tools.writtenPaths].filter((p) => !p.startsWith(".cander/")).slice(0, 40).join(", ") || "(unknown)"}`,
        `Verification report:\n${(result.lastText || "").slice(0, 6000)}`,
        "Fix these problems now, re-run tsc and check_preview, then call finish.",
      ].join("\n\n"),
      budget: repairBudget,
      onFinishRequested: acceptance,
      label: "repair",
      sdkOwnedLoop: flags.sdkOwnedLoop,
      signal: jobAbort.signal,
    });
    metrics.repairCalls += Math.max(0, llm.calls - callsBefore);
    const repairNorm = { ...repair, reason: normalizeAgentReason(repair.reason) };
    if (repairNorm.finished) {
      result = { ...repairNorm, summary: result.summary || repairNorm.summary };
    } else {
      // Prefer the freshest acceptance report over the pre-repair snapshot
      // (resume verify often reports a problem the repair already fixed).
      const latestText =
        (lastVerification && !lastVerification.ok && lastVerification.report) ||
        repairNorm.lastText ||
        result.lastText ||
        "";
      const budgetish =
        repairNorm.reason === "timeout" ||
        repairNorm.reason === "budget_exceeded" ||
        repairNorm.reason === "deadline" ||
        repairNorm.reason === "llm_budget" ||
        repairNorm.reason === "tool_budget";
      result = {
        ...result,
        reason:
          repairNorm.reason === "preview_infrastructure_failure" ||
          repairNorm.reason === "preview_unavailable" ||
          budgetish
            ? repairNorm.reason
            : result.reason,
        lastText: latestText,
        routes: lastVerification?.routes || repairNorm.routes || result.routes,
      };
    }
  }

  // ---- phase: visual QA (after technical pass; create + visual edits) -------
  const wantVisualQa =
    flags.visualQa &&
    result.finished &&
    !result.unverified &&
    (mode === "create" || Boolean(config.visualQaForEdit));
  if (wantVisualQa && !jobAbort.signal.aborted) {
    const maxVisualRepairs = Number(config.budget?.maxVisualRepairs || 2);
    let visualAttempt = 0;
    while (visualAttempt <= maxVisualRepairs && result.finished && !result.unverified) {
      visualAttempt += 1;
      metrics.visualQaAttempts += 1;
      const routes =
        result.routes?.length
          ? result.routes
          : lastVerification?.routes?.length
            ? lastVerification.routes
            : ["/"];
      const evidence = await captureVisualEvidence({
        devServerUrl,
        routes,
        log,
        repoDir,
        projectKind,
      });
      noteModel(models.visualReview);
      const visual = await runVisualQa({
        llm,
        model: models.visualReview,
        log,
        projectKind,
        projectName: config.projectName,
        designDirection: designDirection || String(config.projectSpec?.visual?.direction || ""),
        evidence,
      });
      writeVisualReport(jobDir, visual);
      if (visual.ok || visual.skipped) break;
      if (visualAttempt > maxVisualRepairs) {
        // Soft-fail: keep technical success; attach visual notes for the user.
        result = {
          ...result,
          summary: `${result.summary || "Draft ready."} (Visual polish still open: ${visual.issues.slice(0, 2).join("; ")})`,
        };
        break;
      }
      log.emit("status", "Polishing the design", { visualRepair: true, attempt: visualAttempt });
      const designRepair = await runAgent({
        llm,
        tools,
        log,
        model: coderModel,
        reasoning: "low",
        instructions: [
          `You are Cander Builder — fixing visual quality issues only.`,
          STACK_RULES,
          WORKFLOW_DESIGN_REPAIR,
        ].join("\n\n"),
        task: [
          `Project: ${config.projectName || "Untitled"}`,
          `Routes: ${routes.join(", ")}`,
          visual.report,
          "Fix only these visual issues, then finish.",
        ].join("\n\n"),
        budget: {
          deadlineMs: Math.min(budget.deadlineMs, Date.now() + 6 * 60_000),
          maxLlmCalls: 24,
          maxToolCalls: 80,
        },
        onFinishRequested: acceptance,
        label: "design-repair",
        sdkOwnedLoop: flags.sdkOwnedLoop,
        signal: jobAbort.signal,
      });
      if (designRepair.finished) {
        result = { ...designRepair, summary: result.summary || designRepair.summary };
      } else {
        break;
      }
    }
  }

  // Count writes AFTER repair so resumed verify→repair jobs that only touch
  // files in the repair pass still persist / hand off a partial draft.
  const realWrites = [...tools.writtenPaths].filter((p) => !p.startsWith(".cander/")).length;

  // The coder gave up because the preview was down (not because of its code):
  // that is a handoff, not a failure, as long as there is a draft to hand over.
  if (
    !result.finished &&
    (result.reason === "preview_infrastructure_failure" || result.reason === "preview_unavailable") &&
    realWrites > 0
  ) {
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

  const recovery = preview.summary();
  metrics.previewRestarts = Number(recovery?.recoveries ?? preview.recoveries ?? 0);
  const stats = {
    llmCalls: llm.calls,
    inputTokens: llm.inputTokens,
    outputTokens: llm.outputTokens,
    toolCalls: tools.toolCalls,
    filesTouched: realWrites,
    durationMs: Date.now() - metrics.startedAt,
    modelsUsed: metrics.modelsUsed,
    planningCalls: metrics.planningCalls,
    coderCalls: metrics.coderCalls,
    repairCalls: metrics.repairCalls,
    visualQaAttempts: metrics.visualQaAttempts,
    twentyFirstSearches: metrics.twentyFirstSearches,
    twentyFirstFetches: metrics.twentyFirstFetches,
    componentsSelected: metrics.componentsSelected,
    acceptanceAttempts: metrics.acceptanceAttempts,
    previewRestarts: metrics.previewRestarts,
    coderModel,
    flags,
  };
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
  } else if (realWrites > 0 && result.reason !== "acceptance_failed" && result.reason !== "verification_failed") {
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
      result.reason === "acceptance_failed" || result.reason === "verification_failed"
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
  const r = normalizeAgentReason(reason);
  if (r === "preview_infrastructure_failure" || r === "preview_unavailable") return "infra";
  if (r === "acceptance_failed" || r === "verification_failed") {
    return recovery?.last && recovery.last.ok === false && recovery.last.kind === "infra" ? "infra" : "app";
  }
  if (r === "timeout" || r === "deadline" || r === "budget_exceeded" || r === "llm_budget" || r === "tool_budget") {
    return "budget";
  }
  if (r === "no_tool_calls" || r === "model_failure") return "agent";
  if (r === "cancelled") return "infra";
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
