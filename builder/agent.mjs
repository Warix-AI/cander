// Tool-calling agent loop on the Responses API.
// Bounded by wall-clock and LLM-call budgets, never by a small round count.

import { extractFunctionCalls, extractText } from "./llm.mjs";

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
 *   onFinishRequested?: (finish: { summary: string, routes: string[] }) => Promise<{ accept: boolean, feedback?: string }>,
 *   label?: string,
 * }} opts
 * @returns {Promise<{ finished: boolean, summary: string, routes: string[], reason: string, lastText: string }>}
 */
export async function runAgent(opts) {
  const { llm, tools, log, model, instructions, task, budget } = opts;
  const label = opts.label || "agent";
  let previousResponseId = null;
  let input = [{ role: "user", content: task }];
  let llmCalls = 0;
  let lastText = "";
  let idleTurns = 0;
  let finishRejections = 0;
  /** Consecutive check_preview rounds where every route failed (0/5xx). */
  let deadPreviewStreak = 0;

  for (;;) {
    if (Date.now() > budget.deadlineMs) {
      return { finished: false, summary: "", routes: [], reason: "deadline", lastText };
    }
    if (llmCalls >= budget.maxLlmCalls) {
      return { finished: false, summary: "", routes: [], reason: "llm_budget", lastText };
    }

    llmCalls += 1;
    const body = {
      model,
      instructions,
      input,
      tools: tools.definitions(),
      tool_choice: "auto",
      parallel_tool_calls: true,
      ...(opts.reasoning ? { reasoning: { effort: opts.reasoning } } : {}),
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
    };

    let response;
    try {
      response = await llm.responses(body);
    } catch (err) {
      const msg = err?.message || String(err);
      // A broken previous_response_id chain (expired / proxy restart) — restart
      // the conversation with a summary rather than dying.
      if (previousResponseId && /previous_response|not found|invalid/i.test(msg)) {
        log.emit("log", `${label}: response chain reset (${msg.slice(0, 120)})`);
        previousResponseId = null;
        input = [
          {
            role: "user",
            content: `${task}\n\n(Conversation state was reset. Re-inspect the repo with list_tree/read_file before continuing.)`,
          },
        ];
        continue;
      }
      throw err;
    }

    previousResponseId = response?.id || previousResponseId;
    const text = extractText(response);
    if (text) lastText = text;
    const calls = extractFunctionCalls(response);
    log.emit("llm", `${label}: ${calls.length} tool call(s)${text ? ` · ${text.slice(0, 120)}` : ""}`, {
      calls: calls.map((c) => c.name),
      usage: response?.usage ?? null,
    });

    if (!calls.length) {
      idleTurns += 1;
      if (idleTurns >= 2) {
        return { finished: false, summary: lastText, routes: [], reason: "no_tool_calls", lastText };
      }
      input = [
        {
          role: "user",
          content:
            "You replied without calling a tool. Continue the work with tools, and call finish(summary, routes) when the site is complete and verified.",
        },
      ];
      continue;
    }
    idleTurns = 0;

    const outputs = [];
    let finishResult = null;
    for (const call of calls) {
      if (call.arguments?._parse_error) {
        outputs.push({
          type: "function_call_output",
          call_id: call.callId,
          output: `ERROR: arguments were not valid JSON: ${call.arguments.raw}`,
        });
        continue;
      }
      if (call.name === "finish") {
        const finish = {
          summary: String(call.arguments?.summary ?? ""),
          routes: Array.isArray(call.arguments?.routes) ? call.arguments.routes.map(String) : [],
        };
        let verdict = { accept: true };
        if (opts.onFinishRequested) {
          verdict = await opts.onFinishRequested(finish);
        }
        if (verdict.accept) {
          finishResult = finish;
          outputs.push({
            type: "function_call_output",
            call_id: call.callId,
            output: "finish accepted",
          });
        } else {
          finishRejections += 1;
          outputs.push({
            type: "function_call_output",
            call_id: call.callId,
            output: `finish REJECTED — fix these before finishing:\n${verdict.feedback || "verification failed"}`,
          });
          if (finishRejections >= 3) {
            return {
              finished: false,
              summary: finish.summary,
              routes: finish.routes,
              reason: "verification_failed",
              lastText: verdict.feedback || lastText,
            };
          }
        }
        continue;
      }
      const result = await tools.call(call.name, call.arguments);
      let output = result.output;
      if (call.name === "check_preview") {
        const text = String(output || "");
        const lines = text.split("\n").filter((l) => /→ HTTP\s+\d+/.test(l));
        const allDead =
          lines.length > 0 &&
          lines.every((l) => /→ HTTP\s+(0|[45]\d\d)\b/.test(l));
        if (allDead) {
          deadPreviewStreak += 1;
          if (deadPreviewStreak >= 3) {
            output +=
              "\n\nSTOP: the preview has failed " +
              deadPreviewStreak +
              " times in a row. Do NOT run npm run dev / next dev / pkill. " +
              "Fix code with edit_file if you see a clear compile error; otherwise call finish(summary, routes) and let final verification restart the preview.";
          }
          if (deadPreviewStreak >= 5) {
            return {
              finished: false,
              summary: "",
              routes: [],
              reason: "verification_failed",
              lastText:
                "Preview stayed down after repeated checks. Stopped to avoid burning more tokens — hit Retry.",
            };
          }
        } else if (lines.length) {
          deadPreviewStreak = 0;
        }
      }
      outputs.push({
        type: "function_call_output",
        call_id: call.callId,
        output,
      });
    }

    if (finishResult) {
      return { finished: true, ...finishResult, reason: "finished", lastText };
    }
    input = outputs;
  }
}
