"use client";

/**
 * Simple turn runtime —
 * HYDRATE → INTERPRET/NORMALIZE → RUN → VERIFY → ANSWER → COMMIT
 *
 * First model call's job: turn messy language into clean executable intents.
 */

import { collectCitationsFromToolResults } from "../orchestrator/collect-citations.ts";
import {
  finalizeTurnTrace,
  getTurnTraceRecorder,
  startTurnTrace,
} from "../orchestrator/turn-trace/index.ts";
import { generateFmTurn } from "../runtime/native/fm-generate.ts";
import type {
  AgentTurnOptions,
  AgentTurnResult,
} from "../runtime/agent-turn.ts";
import type { AiGenerateRequest } from "../runtime/types.ts";
import type { AiToolCallResult } from "../runtime/tools.ts";

import { answerTurn } from "./answer.ts";
import { checkEvidence } from "./check.ts";
import { commitTurnNotes } from "./commit.ts";
import { hydrateTurn } from "./hydrate.ts";
import { planTurn } from "./plan.ts";
import { runLookups } from "./run.ts";
import { loadSimpleState } from "./state-store.ts";
import { validateAndRepairPlan } from "./validate-plan.ts";
import type { Lookup, SimpleEvidence } from "./types.ts";

function citationsFromEvidence(items: SimpleEvidence[]) {
  return items
    .filter((e): e is SimpleEvidence & { url: string } =>
      Boolean(e.accepted && e.url),
    )
    .slice(0, 3)
    .map((e, i) => ({
      id: e.id || `c${i}`,
      title: e.title,
      url: e.url,
    }));
}

export async function runSimpleTurnRuntime(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<AgentTurnResult> {
  const report = opts?.onProgress ?? (() => {});
  const text = (request.content || "").trim();

  startTurnTrace({
    threadId: request.threadId ?? undefined,
    aiChatId: request.aiChatId ?? undefined,
    userInput: text,
  });
  const trace = getTurnTraceRecorder();

  try {
    report({ phase: "thinking", label: "Thinking", detail: "Hydrating context" });

    const state = loadSimpleState({
      threadId: request.threadId,
      text,
      attachments: [],
    });

    // —— HYDRATE ——
    const hydrate = hydrateTurn(state);
    trace?.recordStage("hydrate", {
      decision: "hydrated",
      output: {
        resolved: hydrate.resolved,
        unresolved: hydrate.unresolved,
        urls: hydrate.urls,
        topicHint: hydrate.topicHint,
      },
    });

    // —— INTERPRET / NORMALIZE ——
    report({
      phase: "thinking",
      label: "Thinking",
      detail: "Normalizing intents",
    });
    const canFm =
      typeof window !== "undefined" ||
      process.env.NODE_ENV === "development";

    const generate = async (prompt: string, instructions: string) => {
      try {
        const fm = await generateFmTurn({ prompt, instructions });
        return fm.text;
      } catch {
        return "";
      }
    };

    const planned = await planTurn({
      hydrate,
      generate: canFm ? generate : undefined,
      useHeuristicOnly: !canFm,
    });
    // Log structured plan + PlanHealth only — never free-form deliberation
    trace?.recordStage("interpret", {
      decision: planned.usedHeuristic ? "heuristic" : "fm",
      output: {
        overallIntent: planned.plan.overallIntent,
        intents: planned.plan.intents,
        planHealth: planned.planHealth,
        selfCheckIssues: planned.selfCheckIssues,
      },
      input: {
        deliberationDepth: planned.deliberationDepth,
        rawChars: planned.raw?.length ?? 0,
      },
    });
    trace?.recordStage("plan", {
      decision: planned.usedHeuristic ? "heuristic" : "fm",
      output: {
        flatPlan: planned.flatPlan,
        planHealth: planned.planHealth,
      },
    });
    if (!planned.usedHeuristic) {
      trace?.recordModelPrompt({
        round: 0,
        prompt: hydrate.planPrompt.slice(0, 2000),
        instructions: `INTERPRET IntentPlan (${planned.deliberationDepth})`,
      });
      if (planned.raw) {
        // Structured IntentPlan JSON only — truncate; no CoT storage
        trace?.recordModelOutput({
          round: 0,
          text: planned.raw.slice(0, 2000),
          structured: true,
        });
      }
    }

    // —— VALIDATE / REPAIR (one bounded pass — never ask user to split) ——
    const validated = validateAndRepairPlan({
      plan: planned.plan,
      hydrate,
      browser: state.browser,
    });
    trace?.recordStage("plan_validate", {
      decision: validated.failed ? "failed" : "ok",
      failureType: validated.failed ? "validation_failed" : undefined,
      output: {
        issues: validated.issues,
        intents: validated.plan.intents,
      },
    });

    if (validated.failed) {
      const content =
        "I couldn't prepare a reliable plan for that request. Please try again.";
      trace?.recordFinalResponse({ content, finalSource: "research_incomplete" });
      finalizeTurnTrace({ failureReason: "plan_validation_failed" });
      return {
        content,
        runtime: "apple-local",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
      };
    }

    const intentPlan = validated.plan;
    const plan = validated.flatPlan;
    let allEvidence: SimpleEvidence[] = [];
    let lookupsRun: Lookup[] = [];
    let intentResults = undefined as
      | import("./types.ts").IntentResult[]
      | undefined;
    let check = checkEvidence({
      plan,
      hydrate,
      evidence: [],
      lookupsRun: [],
      round: 0,
    });
    let corroborationDone = false;

    const needsRetrieval = intentPlan.intents.some(
      (i) => i.action !== "ANSWER",
    );

    // —— RUN (dependency waves) + VERIFY ——
    if (needsRetrieval) {
      for (let round = 1; round <= 2; round++) {
        const failedIds =
          round > 1 && check.needsRefine
            ? check.intentResults
                ?.filter(
                  (r) =>
                    r.status === "unresolved" || r.status === "failed",
                )
                .map((r) => r.intent.id)
            : undefined;

        report({
          phase: "tool",
          label: "Thinking",
          detail:
            round === 1
              ? "Looking things up"
              : check.needsCorroboration
                ? "Double-checking sources"
                : "Refining search",
          toolName: "web.search",
        });

        const run = await runLookups({
          plan: intentPlan,
          browser: state.browser,
          userText: hydrate.userText,
          cache: state.cache,
          extraLookups:
            round > 1
              ? check.needsCorroboration
                ? check.corroborateLookups
                : check.refineLookups
              : undefined,
          onlyIntentIds: failedIds?.length ? failedIds : undefined,
        });

        for (const look of run.lookupsRun) {
          const tool =
            look.cap === "WEB"
              ? /^https?:\/\//i.test(look.q) ||
                /^[a-z0-9].*\.[a-z]{2,}/i.test(look.q)
                ? "web.read"
                : "web.search"
              : look.cap.toLowerCase();
          trace?.recordToolRequest({
            tool,
            arguments: { query: look.q, intentId: look.intentId },
            reason: `simple_turn_round_${round}`,
          });
        }

        allEvidence = [...allEvidence, ...run.evidence];
        lookupsRun = [...lookupsRun, ...run.lookupsRun];
        intentResults = run.intentResults;

        for (const ev of run.evidence) {
          trace?.recordToolResponseRaw({
            tool: ev.sourceTool,
            ok: ev.ok,
            durationMs: 0,
            rawOutput: ev.ok
              ? ev.content.slice(0, 500)
              : ev.rejectReason ?? "failed",
          });
        }

        if (check.needsCorroboration && round > 1) {
          corroborationDone = true;
        }

        check = checkEvidence({
          plan,
          hydrate,
          evidence: allEvidence,
          lookupsRun,
          round,
          corroborationDone,
          intentResults,
        });
        intentResults = check.intentResults ?? intentResults;

        trace?.recordStage("verify", {
          decision: check.unresolved
            ? "unresolved"
            : check.needsRefine
              ? "refine"
              : check.needsCorroboration
                ? "corroborate"
                : "ok",
          output: {
            intents: intentResults?.map((r) => ({
              id: r.intent.id,
              status: r.status,
              goal: r.intent.goal,
              q: r.intent.lookup?.q,
            })),
            accepted: check.accepted.map((a) => ({
              id: a.id,
              score: a.verify?.score,
            })),
          },
        });

        for (const a of check.accepted) {
          trace?.recordStage("evidence_accept", {
            decision: "accepted",
            output: { id: a.id, title: a.title, intentId: a.intentId },
          });
        }
        for (const r of check.rejected) {
          trace?.recordStage("evidence_reject", {
            decision: r.rejectReason ?? "rejected",
            failureType: "evidence_rejected",
            output: { id: r.id, reason: r.rejectReason },
          });
        }

        if (check.needsCorroboration && !corroborationDone && round < 2) {
          trace?.recordStage("retry", {
            decision: "corroborate",
            output: check.corroborateLookups,
          });
          continue;
        }
        if (!check.needsRefine) break;
        if (round >= 2) break;
        trace?.recordStage("retry", {
          decision: "refine_retrieval",
          output: check.refineLookups,
        });
      }
    } else {
      check = {
        accepted: [],
        rejected: [],
        needsRefine: false,
        needsCorroboration: false,
        needsDeeperSearch: false,
        unresolved: false,
      };
    }

    // Freshness required + no accepted evidence → unresolved (no memory answer)
    if (
      plan.freshnessRequired &&
      !check.accepted.length &&
      needsRetrieval
    ) {
      check = {
        ...check,
        unresolved: true,
        unresolvedReason:
          check.unresolvedReason ??
          "fresh/current ask with no verified evidence",
      };
    }

    // Answer only once every intent is completed, unresolved, or skipped
    const pendingIntents = intentResults?.some(
      (r) => r.status === "pending" || r.status === "running",
    );
    if (pendingIntents) {
      check = {
        ...check,
        unresolved: true,
        unresolvedReason: "intents incomplete",
      };
    }

    // —— ANSWER ——
    report({ phase: "generating", label: "Thinking", detail: "Generating" });
    const packet = await answerTurn({
      plan,
      hydrate,
      accepted: check.accepted,
      unresolved: check.unresolved,
      unresolvedReason: check.unresolvedReason,
      generate: canFm ? generate : undefined,
      useHeuristicOnly: !canFm,
      intentResults,
    });

    trace?.recordStage("answer_path", {
      decision: packet.path,
      output: { answerChars: packet.answer.length },
    });

    // —— COMMIT ——
    const notes = commitTurnNotes({
      threadId: request.threadId,
      prior: state.notes,
      packet,
      hydrate,
    });
    trace?.recordStage("commit", {
      decision: "notes_updated",
      output: notes,
    });

    const toolResults = allEvidence.map(
      (e): AiToolCallResult => ({
        name: e.sourceTool,
        ok: e.ok,
        output: e.content,
        data: {
          title: e.title,
          url: e.url,
          query: e.query,
          intentId: e.intentId,
        },
      }),
    );

    const citations =
      citationsFromEvidence(check.accepted).length > 0
        ? citationsFromEvidence(check.accepted)
        : collectCitationsFromToolResults(toolResults).slice(0, 3);

    trace?.recordFinalResponse({
      content: packet.answer,
      citations: citations.map((c) => ({
        id: c.id,
        url: c.url,
        title: c.title,
      })),
      finalSource:
        packet.path === "deterministic"
          ? "deterministic_render"
          : packet.path === "fm_synthesis"
            ? "fm_synthesis"
            : "research_incomplete",
    });
    finalizeTurnTrace(
      packet.path === "unresolved"
        ? { failureReason: check.unresolvedReason ?? "unresolved" }
        : undefined,
    );

    return {
      content: packet.answer,
      runtime: "apple-local",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
      toolResults: toolResults.length ? toolResults : undefined,
      citations: citations.length ? citations : undefined,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message.slice(0, 280) : "Turn failed.";
    console.error("[SIMPLE_TURN]", message);
    finalizeTurnTrace({ failureReason: message });
    return {
      content: "Something went wrong generating a reply. Please try again.",
      runtime: "apple-local",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
    };
  }
}
