"use client";

/**
 * Simple turn runtime — HYDRATE → PLAN → RUN → CHECK → ANSWER → COMMIT.
 * Flag-gated replacement for TaskGraph local orchestration.
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
import type { SimpleEvidence } from "./types.ts";

function citationsFromEvidence(items: SimpleEvidence[]) {
  return items
    .filter((e) => e.accepted && e.url)
    .slice(0, 3)
    .map((e, i) => ({
      id: e.id || `c${i}`,
      title: e.title,
      url: e.url ?? undefined,
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

    // —— PLAN ——
    report({ phase: "thinking", label: "Thinking", detail: "Interpreting request" });
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
    trace?.recordStage("plan", {
      decision: planned.usedHeuristic ? "heuristic" : "fm",
      output: planned.plan,
      input: planned.raw ? { rawChars: planned.raw.length } : undefined,
    });
    if (!planned.usedHeuristic) {
      trace?.recordModelPrompt({
        round: 0,
        prompt: hydrate.planPrompt.slice(0, 2000),
        instructions: "PLAN schema",
      });
      if (planned.raw) {
        trace?.recordModelOutput({
          round: 0,
          text: planned.raw.slice(0, 2000),
          structured: true,
        });
      }
    }

    // —— VALIDATE / REPAIR ——
    const validated = validateAndRepairPlan({
      plan: planned.plan,
      hydrate,
      browser: state.browser,
    });
    trace?.recordStage("plan_validate", {
      decision: validated.failed ? "failed" : "ok",
      failureType: validated.failed ? "validation_failed" : undefined,
      output: { issues: validated.issues, plan: validated.plan },
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

    const plan = validated.plan;
    let allEvidence: SimpleEvidence[] = [];
    let lookupsRun = plan.look ?? [];
    let check = checkEvidence({
      plan,
      hydrate,
      evidence: [],
      lookupsRun: [],
      round: 0,
    });

    // —— RUN + CHECK (max 2 rounds) ——
    if (plan.look?.length || plan.fresh) {
      for (let round = 1; round <= 2; round++) {
        report({
          phase: "tool",
          label: "Thinking",
          detail: round === 1 ? "Looking things up" : "Refining search",
          toolName: "web.search",
        });

        const run = await runLookups({
          plan,
          browser: state.browser,
          userText: hydrate.userText,
          cache: state.cache,
          extraLookups: round > 1 ? check.refineLookups : undefined,
        });

        for (const look of run.lookupsRun) {
          trace?.recordToolRequest({
            tool: look.cap === "WEB" ? "web.search" : look.cap.toLowerCase(),
            arguments: { query: look.q },
            reason: `simple_turn_round_${round}`,
          });
        }

        allEvidence = [...allEvidence, ...run.evidence];
        lookupsRun = run.lookupsRun;

        for (const ev of run.evidence) {
          if (ev.ok) {
            trace?.recordToolResponseRaw({
              tool: ev.sourceTool,
              ok: true,
              rawOutput: ev.content.slice(0, 500),
            });
          } else {
            trace?.recordToolResponseRaw({
              tool: ev.sourceTool,
              ok: false,
              rawOutput: ev.rejectReason ?? "failed",
            });
          }
        }

        check = checkEvidence({
          plan,
          hydrate,
          evidence: allEvidence,
          lookupsRun,
          round,
        });

        for (const a of check.accepted) {
          trace?.recordStage("evidence_accept", {
            decision: "accepted",
            output: { id: a.id, title: a.title, query: a.query },
          });
        }
        for (const r of check.rejected) {
          trace?.recordStage("evidence_reject", {
            decision: r.rejectReason ?? "rejected",
            failureType: "evidence_rejected",
            output: { id: r.id, reason: r.rejectReason },
          });
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
        unresolved: false,
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
        data: { title: e.title, url: e.url, query: e.query },
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
