/**
 * AskExtractor — FM decomposition when heuristics fail (v4 TaskGraph refactor).
 * Decompose only; never answer.
 */

import type { RequestLedger } from "./request-scanner.ts";
import type { TurnTaskResolution } from "@/lib/ai/turn-environment/turn-task.ts";
import { atomicQueryFromAsk } from "./task-graph.ts";
import { requiresExternalEvidence } from "./deterministic-triggers.ts";

export type RetrieveTaskSpec = {
  id: string;
  label: string;
  query: string;
  capability: "web.search" | "web.read" | "web.open" | "none";
  dependsOn?: string[];
  spanId?: string;
  askId?: string;
};

/** Deterministic multi-ask decomposition — one RETRIEVE per ASK span. */
export function heuristicAskDecomposition(
  ledger: RequestLedger,
  turnTask?: TurnTaskResolution,
): RetrieveTaskSpec[] {
  const specs: RetrieveTaskSpec[] = [];
  for (const ask of ledger.asks) {
    if (!requiresExternalEvidence(ask.text) && !requiresExternalEvidence(ledger.rawInput)) {
      continue;
    }
    specs.push({
      id: `retrieve_${ask.id}`,
      label: ask.text.slice(0, 100),
      query: atomicQueryFromAsk(ask.text, turnTask),
      capability: "web.search",
      spanId: ask.id,
      askId: `ask_${ask.id}`,
    });
  }
  return specs;
}

function parseExtractorJson(raw: string): RetrieveTaskSpec[] | null {
  const match = raw.match(/\{[\s\S]*"tasks"[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as {
      tasks?: Array<{
        id?: string;
        label?: string;
        query?: string;
        capability?: string;
        dependsOn?: string[];
      }>;
    };
    if (!Array.isArray(parsed.tasks) || !parsed.tasks.length) return null;
    return parsed.tasks
      .filter((t) => t.query?.trim())
      .map((t, i) => ({
        id: t.id?.trim() || `retrieve_fm_${i}`,
        label: (t.label ?? t.query ?? "").slice(0, 100),
        query: t.query!.trim().slice(0, 400),
        capability:
          t.capability === "web.read" || t.capability === "web.open"
            ? t.capability
            : ("web.search" as const),
        dependsOn: t.dependsOn,
      }));
  } catch {
    return null;
  }
}

export async function extractAsksWithFm(opts: {
  content: string;
  ledger: RequestLedger;
  generate: (prompt: string, instructions: string) => Promise<string>;
}): Promise<RetrieveTaskSpec[]> {
  const instructions = [
    "You decompose user messages into atomic retrieval tasks only.",
    "Return JSON: { \"tasks\": [ { \"id\": \"t1\", \"label\": \"short label\", \"query\": \"atomic search query\", \"capability\": \"web.search\", \"dependsOn\": [] } ] }",
    "Rules:",
    "- One task per distinct ask that needs live/external facts.",
    "- Never combine independent asks into one query.",
    "- Use dependsOn only when one task truly needs another's result first.",
    "- Do not answer the user. Do not include constraints as tasks.",
    "- capability must be web.search, web.read, or web.open.",
  ].join("\n");

  const prompt = [
    "Decompose this user message into atomic retrieval tasks:",
    opts.content.trim(),
    "",
    "Detected asks:",
    ...opts.ledger.asks.map((a) => `- ${a.text}`),
    "",
    "Constraints (do not turn into tasks):",
    ...opts.ledger.constraints.map((c) => `- ${c.text}`),
  ].join("\n");

  try {
    const raw = await opts.generate(prompt, instructions);
    const parsed = parseExtractorJson(raw);
    if (parsed?.length) return parsed;
  } catch {
    // fall through to heuristic
  }
  return heuristicAskDecomposition(opts.ledger);
}
