// Coding agent run on the OpenAI Agents SDK.
//
// The SDK owns the model ↔ tool loop (Responses API chaining, tool dispatch,
// parallel calls, max turns). Cander owns everything around it: the tool
// implementations, the finish/verify contract, preview-outage heuristics and
// the wall-clock / call budgets. Same `runAgent` contract as before so the
// orchestrator (index.mjs) is unchanged.

import { configureAgentsSdk, loadAgentsSdk } from "./sdk.mjs";
import { safeJson } from "./llm.mjs";

/**
 * @param {{
 *   llm: import("./llm.mjs").LlmClient,
 *   tools: import("./tools.mjs").SandboxTools,
 *   log: import("./events.mjs").EventLog,
 *   model: string,
 *   instructions: string,
 *   task: string,
 *   reasoning?: string,
 *   budget: { deadlineMs: number, maxLlmCalls: number },
 *   onFinishRequested?: (finish: { summary: string, routes: string[] }) => Promise<{ accept: boolean, feedback?: string, infra?: boolean, classification?: string }>,
 *   label?: string,
 * }} opts
 * @returns {Promise<{ finished: boolean, summary: string, routes: string[], reason: string, lastText: string, unverified?: boolean, classification?: string }>}
 */
export async function runAgent(opts) {
  const { llm, tools, log, model, instructions, task, budget } = opts;
  const label = opts.label || "agent";
  const sdk = await loadAgentsSdk(log);
  const client = configureAgentsSdk(sdk, { transport: llm.transport, apiBase: llm.apiBase, jobId: llm.jobId, token: llm.token });
  const { Agent, Runner, tool, MaxTurnsExceededError } = sdk.agents;

  /** Mutable per-run state shared between tool executors and the stop rule. */
  const state = {
    /** Set when the run must end: { result } is the runAgent return value. */
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
      state.stop = { result: { finished: true, ...finish, reason: "finished", lastText: state.lastText } };
      return "finish accepted";
    }
    if (verdict.infra) {
      // The preview cannot be verified from inside this sandbox and that is
      // not the coder's problem. Hand the draft to the server unverified.
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
    if (state.finishRejections >= 3) {
      state.stop = {
        result: {
          finished: false,
          summary: finish.summary,
          routes: finish.routes,
          reason: "verification_failed",
          lastText: verdict.feedback || state.lastText,
        },
      };
    }
    return `finish REJECTED — fix these before finishing:\n${verdict.feedback || "verification failed"}`;
  }

  function observePreview(text) {
    let output = text;
    if (/^PREVIEW UNAVAILABLE — INFRASTRUCTURE/.test(text)) {
      // The supervisor already tried to recover. Re-checking without new code
      // is pure token burn: nudge, then end the run as an unverified handoff.
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
            reason: "preview_unavailable",
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
            reason: "verification_failed",
            lastText: "Preview stayed down after repeated checks. Stopped to avoid burning more tokens — hit Retry.",
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
    // Cander decides when the run is over (finish accepted, infra handoff,
    // repeated rejections) — otherwise the model keeps working with tools.
    toolUseBehavior: () =>
      state.stop
        ? { isFinalOutput: true, finalOutput: String(state.stop.result.summary || state.stop.result.reason || "done") }
        : { isFinalOutput: false },
  });

  const runner = new Runner({ tracingDisabled: llm.transport === "proxy" });
  const abort = new AbortController();
  const deadlineTimer = setTimeout(() => abort.abort(new Error("deadline")), Math.max(1, budget.deadlineMs - Date.now()));

  // Server-managed conversation: the SDK then sends only each turn's delta
  // (tool outputs) instead of replaying the whole transcript per model call.
  // Falls back to client-managed history if the conversation cannot be made.
  let conversationId;
  try {
    const conv = await client.conversations.create({});
    conversationId = conv?.id || undefined;
  } catch (err) {
    log.emit("log", `${label}: conversation create failed, using local history (${String(err?.message || err).slice(0, 120)})`);
  }

  let input = task;
  let previousResponseId;
  let idleTurns = 0;
  let calls = 0;

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
    log.emit("llm", `${label}: ${raws.length} model call(s), ${toolNames.length} tool call(s)${text ? ` · ${text.slice(0, 120)}` : ""}`, {
      calls: toolNames.slice(0, 40),
      usage: { inputTokens: llm.inputTokens, outputTokens: llm.outputTokens, requests: llm.calls },
    });
  };

  try {
    for (;;) {
      if (Date.now() > budget.deadlineMs) {
        return { finished: false, summary: "", routes: [], reason: "deadline", lastText: state.lastText };
      }
      const remaining = budget.maxLlmCalls - calls;
      if (remaining <= 0) {
        return { finished: false, summary: "", routes: [], reason: "llm_budget", lastText: state.lastText };
      }

      let result;
      try {
        result = await runner.run(agent, input, {
          maxTurns: remaining,
          signal: abort.signal,
          ...(conversationId ? { conversationId } : previousResponseId ? { previousResponseId } : {}),
        });
      } catch (err) {
        const msg = err?.message || String(err);
        if (err instanceof MaxTurnsExceededError || /max turns/i.test(msg)) {
          return { finished: false, summary: "", routes: [], reason: "llm_budget", lastText: state.lastText };
        }
        if (abort.signal.aborted || /abort|deadline/i.test(msg)) {
          return { finished: false, summary: "", routes: [], reason: "deadline", lastText: state.lastText };
        }
        if ((conversationId || previousResponseId) && /previous_response|conversation|not found|invalid/i.test(msg)) {
          // Broken server-side state (expired / proxy restart): restart with a note.
          log.emit("log", `${label}: conversation reset (${msg.slice(0, 120)})`);
          conversationId = undefined;
          previousResponseId = undefined;
          input = `${task}\n\n(Conversation state was reset. Re-inspect the repo with list_tree/read_file before continuing.)`;
          continue;
        }
        throw err;
      }

      account(result);
      if (state.stop) return state.stop.result;

      // The model answered in prose without finishing: nudge it back to tools.
      idleTurns += 1;
      if (idleTurns >= 2) {
        return { finished: false, summary: state.lastText, routes: [], reason: "no_tool_calls", lastText: state.lastText };
      }
      if (!conversationId) previousResponseId = result.lastResponseId || previousResponseId;
      input = "You replied without calling a tool. Continue the work with tools, and call finish(summary, routes) when the site is complete and verified.";
    }
  } finally {
    clearTimeout(deadlineTimer);
  }
}
