// Coding agent run on the OpenAI Agents SDK.
//
// Hierarchy: BUILD JOB → builder/index workflow → runAgent → Runner → tools.
// The SDK owns the model↔tool loop. Cander owns finish/verify, budgets, and
// typed exit reasons. When `sdkOwnedLoop` is true, we do not reinflate an
// indefinite outer for(;;) — at most one bounded nudge after a prose-only turn.

import { configureAgentsSdk, loadAgentsSdk } from "./sdk.mjs";
import { safeJson } from "./llm.mjs";

/**
 * Typed stop reasons for every runAgent exit.
 * @typedef {"finished"|"finished_unverified"|"acceptance_failed"|"budget_exceeded"|"timeout"|"cancelled"|"preview_infrastructure_failure"|"model_failure"|"no_tool_calls"|"tool_failure"} AgentExitReason
 */

/**
 * @param {{
 *   llm: import("./llm.mjs").LlmClient,
 *   tools: import("./tools.mjs").SandboxTools,
 *   log: import("./events.mjs").EventLog,
 *   model: string,
 *   instructions: string,
 *   task: string,
 *   reasoning?: string,
 *   budget: { deadlineMs: number, maxLlmCalls: number, maxToolCalls?: number },
 *   onFinishRequested?: (finish: { summary: string, routes: string[] }) => Promise<{ accept: boolean, feedback?: string, infra?: boolean, classification?: string }>,
 *   label?: string,
 *   /** When true, Runner owns the loop; only one prose-nudge recovery is allowed. *\/
 *   sdkOwnedLoop?: boolean,
 *   /** Shared AbortSignal from the job (cancel / wall clock). *\/
 *   signal?: AbortSignal,
 * }} opts
 * @returns {Promise<{ finished: boolean, summary: string, routes: string[], reason: AgentExitReason|string, lastText: string, unverified?: boolean, classification?: string }>}
 */
export async function runAgent(opts) {
  const { llm, tools, log, model, instructions, task, budget } = opts;
  const label = opts.label || "agent";
  const sdkOwnedLoop = opts.sdkOwnedLoop !== false;
  const sdk = await loadAgentsSdk(log);
  const client = configureAgentsSdk(sdk, {
    transport: llm.transport,
    apiBase: llm.apiBase,
    jobId: llm.jobId,
    token: llm.token,
  });
  const { Agent, Runner, tool, MaxTurnsExceededError } = sdk.agents;

  const state = {
    stop: /** @type {null | { result: Record<string, unknown> }} */ (null),
    lastText: "",
    finishRejections: 0,
    deadPreviewStreak: 0,
    infraStreak: 0,
    writesSinceInfra: 0,
    toolCalls: 0,
  };

  const parseArgs = (raw) => {
    const v = typeof raw === "string" ? safeJson(raw) : raw && typeof raw === "object" ? raw : {};
    return v;
  };

  const sdkTools = tools.definitions().map((def) =>
    tool({
      name: def.name,
      description: def.description,
      parameters: def.parameters,
      strict: false,
      execute: async (raw) => {
        if (opts.signal?.aborted) return "ERROR: job cancelled";
        const args = parseArgs(raw);
        if (args?._parse_error) return `ERROR: arguments were not valid JSON: ${args.raw}`;
        state.toolCalls += 1;
        if (def.name === "finish") return handleFinish(args);
        const result = await tools.call(def.name, args);
        let output = String(result.output ?? "");
        if (/^(write_file|edit_file|delete_file)$/.test(def.name)) state.writesSinceInfra += 1;
        if (def.name === "check_preview") output = observePreview(output);
        return output;
      },
    }),
  );

  async function handleFinish(args) {
    const finish = {
      summary: String(args?.summary ?? ""),
      routes: Array.isArray(args?.routes) ? args.routes.map(String) : [],
    };
    let verdict = { accept: true };
    if (opts.onFinishRequested) verdict = await opts.onFinishRequested(finish);
    if (verdict.accept) {
      state.stop = {
        result: { finished: true, ...finish, reason: "finished", lastText: state.lastText },
      };
      return "finish accepted";
    }
    if (verdict.infra) {
      log.emit("log", `${label}: finish accepted unverified (${verdict.classification || "preview_unavailable"})`);
      state.stop = {
        result: {
          finished: true,
          summary: finish.summary,
          routes: finish.routes,
          reason: "finished_unverified",
          lastText: verdict.feedback || state.lastText,
          unverified: true,
          classification: verdict.classification || "preview_unavailable",
        },
      };
      return "finish accepted (preview unavailable — verified server-side)";
    }
    state.finishRejections += 1;
    // Continuous repair: keep the same agent run going with the report as
    // tool output. Cap rejections so we still exit with acceptance_failed.
    const maxRejects = sdkOwnedLoop ? 4 : 3;
    if (state.finishRejections >= maxRejects) {
      state.stop = {
        result: {
          finished: false,
          summary: finish.summary,
          routes: finish.routes,
          reason: "acceptance_failed",
          lastText: verdict.feedback || state.lastText,
        },
      };
    }
    return `finish REJECTED — fix these before finishing:\n${verdict.feedback || "verification failed"}`;
  }

  function observePreview(text) {
    let output = text;
    if (/^PREVIEW UNAVAILABLE — INFRASTRUCTURE/.test(text)) {
      state.infraStreak += 1;
      const idle = state.writesSinceInfra === 0 && state.infraStreak > 1;
      state.writesSinceInfra = 0;
      if (state.infraStreak >= 2) {
        output += `\n\nYou have now checked ${state.infraStreak} times with the preview down. Stop calling check_preview. Finish the remaining files, run tsc, then call finish(summary, routes).`;
      }
      if (state.infraStreak >= 4 || (idle && state.infraStreak >= 3)) {
        state.stop = {
          result: {
            finished: false,
            summary: state.lastText,
            routes: [],
            reason: "preview_infrastructure_failure",
            lastText: text,
            classification: "preview_unavailable",
          },
        };
      }
      return output;
    }
    const lines = text.split("\n").filter((l) => /→ HTTP\s+\d+/.test(l));
    const allDead = lines.length > 0 && lines.every((l) => /→ HTTP\s+(0|[45]\d\d)\b/.test(l));
    if (allDead) {
      state.deadPreviewStreak += 1;
      if (state.deadPreviewStreak >= 3) {
        output +=
          `\n\nSTOP: the preview has failed ${state.deadPreviewStreak} times in a row. Do NOT run npm run dev / next dev / pkill. ` +
          "Fix code with edit_file if you see a clear compile error; otherwise call finish(summary, routes) and let final verification restart the preview.";
      }
      if (state.deadPreviewStreak >= 5) {
        state.stop = {
          result: {
            finished: false,
            summary: "",
            routes: [],
            reason: "acceptance_failed",
            lastText:
              "Preview stayed down after repeated checks. Stopped to avoid burning more tokens — hit Retry.",
          },
        };
      }
    } else if (lines.length) {
      state.deadPreviewStreak = 0;
    }
    return output;
  }

  const agent = new Agent({
    name: label,
    instructions,
    model,
    modelSettings: {
      parallelToolCalls: true,
      store: true,
      ...(opts.reasoning ? { reasoning: { effort: opts.reasoning } } : {}),
    },
    tools: sdkTools,
    toolUseBehavior: () =>
      state.stop
        ? {
            isFinalOutput: true,
            finalOutput: String(state.stop.result.summary || state.stop.result.reason || "done"),
          }
        : { isFinalOutput: false },
  });

  const runner = new Runner({ tracingDisabled: llm.transport === "proxy" });
  const abort = new AbortController();
  const onExternalAbort = () => abort.abort(opts.signal?.reason || new Error("cancelled"));
  if (opts.signal) {
    if (opts.signal.aborted) onExternalAbort();
    else opts.signal.addEventListener("abort", onExternalAbort, { once: true });
  }
  const deadlineTimer = setTimeout(
    () => abort.abort(new Error("deadline")),
    Math.max(1, budget.deadlineMs - Date.now()),
  );

  let conversationId;
  try {
    const conv = await client.conversations.create({});
    conversationId = conv?.id || undefined;
  } catch (err) {
    log.emit(
      "log",
      `${label}: conversation create failed, using local history (${String(err?.message || err).slice(0, 120)})`,
    );
  }

  let input = task;
  let previousResponseId;
  let calls = 0;
  /** At most one prose-nudge when sdkOwnedLoop; legacy allows 2 idle turns. */
  let proseNudges = 0;
  const maxProseNudges = sdkOwnedLoop ? 1 : 2;

  const account = (result) => {
    const raws = Array.isArray(result?.rawResponses) ? result.rawResponses : [];
    calls += raws.length;
    llm.calls += raws.length;
    for (const r of raws) {
      llm.inputTokens += Number(r?.usage?.inputTokens ?? 0);
      llm.outputTokens += Number(r?.usage?.outputTokens ?? 0);
    }
    const toolNames = (result?.newItems || [])
      .filter((i) => i?.type === "tool_call_item")
      .map((i) => i?.rawItem?.name)
      .filter(Boolean);
    const text = typeof result?.finalOutput === "string" ? result.finalOutput : "";
    if (text) state.lastText = text;
    log.emit(
      "llm",
      `${label}: ${raws.length} model call(s), ${toolNames.length} tool call(s)${text ? ` · ${text.slice(0, 120)}` : ""}`,
      {
        calls: toolNames.slice(0, 40),
        usage: { inputTokens: llm.inputTokens, outputTokens: llm.outputTokens, requests: llm.calls },
      },
    );
  };

  const exit = (partial) => ({
    finished: false,
    summary: "",
    routes: [],
    lastText: state.lastText,
    ...partial,
  });

  try {
    // Bounded recovery only: conversation reset (once) + prose nudge (maxProseNudges).
    // The SDK Runner owns the multi-turn tool loop inside each runner.run call.
    for (let recovery = 0; recovery < 4; recovery++) {
      if (opts.signal?.aborted || abort.signal.aborted) {
        return exit({ reason: "cancelled" });
      }
      if (Date.now() > budget.deadlineMs) {
        return exit({ reason: "timeout" });
      }
      const remaining = budget.maxLlmCalls - calls;
      if (remaining <= 0) {
        return exit({ reason: "budget_exceeded" });
      }
      if (budget.maxToolCalls && tools.toolCalls >= budget.maxToolCalls) {
        return exit({ reason: "budget_exceeded" });
      }

      let result;
      try {
        result = await runner.run(agent, input, {
          maxTurns: remaining,
          signal: abort.signal,
          ...(conversationId
            ? { conversationId }
            : previousResponseId
              ? { previousResponseId }
              : {}),
        });
      } catch (err) {
        const msg = err?.message || String(err);
        if (err instanceof MaxTurnsExceededError || /max turns/i.test(msg)) {
          return exit({ reason: "budget_exceeded" });
        }
        if (abort.signal.aborted || /abort|deadline/i.test(msg)) {
          return exit({
            reason: /cancel/i.test(String(opts.signal?.reason || msg)) ? "cancelled" : "timeout",
          });
        }
        if (
          (conversationId || previousResponseId) &&
          /previous_response|conversation|not found|invalid/i.test(msg)
        ) {
          log.emit("log", `${label}: conversation reset (${msg.slice(0, 120)})`);
          conversationId = undefined;
          previousResponseId = undefined;
          input = `${task}\n\n(Conversation state was reset. Re-inspect the repo with list_tree/read_file before continuing.)`;
          continue;
        }
        log.emit("log", `${label}: model failure ${msg.slice(0, 200)}`);
        return exit({ reason: "model_failure", lastText: msg.slice(0, 500) });
      }

      account(result);
      if (state.stop) return state.stop.result;

      // Prose without finish: one bounded nudge, then exit — do not loop forever.
      proseNudges += 1;
      if (proseNudges > maxProseNudges) {
        return exit({
          finished: false,
          summary: state.lastText,
          reason: "no_tool_calls",
          lastText: state.lastText,
        });
      }
      if (!conversationId) previousResponseId = result.lastResponseId || previousResponseId;
      input =
        "You replied without calling a tool. Continue the work with tools, and call finish(summary, routes) when the work is complete and verified.";
    }
    return exit({ reason: "budget_exceeded" });
  } finally {
    clearTimeout(deadlineTimer);
    if (opts.signal) opts.signal.removeEventListener("abort", onExternalAbort);
  }
}

/** Map legacy reason strings used by index.mjs classifyFailure / repair gates. */
export function normalizeAgentReason(reason) {
  if (reason === "verification_failed") return "acceptance_failed";
  if (reason === "preview_unavailable") return "preview_infrastructure_failure";
  if (reason === "deadline") return "timeout";
  if (reason === "llm_budget" || reason === "tool_budget") return "budget_exceeded";
  return reason;
}
