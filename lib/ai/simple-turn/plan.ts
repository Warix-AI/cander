/**
 * PLAN — Apple FM call #1: interpret the user once before execution.
 */

import type { Cap, HydrateResult, Lookup, Plan } from "./types.ts";

const CAPS: Cap[] = [
  "WEB",
  "MEMORY",
  "FILES",
  "CALENDAR",
  "EMAIL",
  "CRM",
  "CALC",
  "BUILD",
];

function isCap(v: unknown): v is Cap {
  return typeof v === "string" && (CAPS as string[]).includes(v);
}

export function parsePlanJson(raw: string): Plan | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (typeof parsed.intent !== "string" || !parsed.intent.trim()) return null;
    const asks = Array.isArray(parsed.asks)
      ? parsed.asks.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
      : [];
    const constraints = Array.isArray(parsed.constraints)
      ? parsed.constraints.filter((c): c is string => typeof c === "string")
      : [];
    const resolvedRefs = Array.isArray(parsed.resolvedRefs)
      ? parsed.resolvedRefs.filter((c): c is string => typeof c === "string")
      : [];
    const unresolvedRefs = Array.isArray(parsed.unresolvedRefs)
      ? parsed.unresolvedRefs.filter((c): c is string => typeof c === "string")
      : [];
    const look: Lookup[] = [];
    if (Array.isArray(parsed.look)) {
      for (const item of parsed.look) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        if (!isCap(row.cap) || typeof row.q !== "string" || !row.q.trim()) continue;
        look.push({ cap: row.cap, q: row.q.trim().slice(0, 400) });
      }
    }
    return {
      intent: parsed.intent.trim().slice(0, 400),
      asks: asks.length ? asks.map((a) => a.slice(0, 300)) : [parsed.intent.trim().slice(0, 300)],
      constraints: constraints.map((c) => c.slice(0, 200)),
      resolvedRefs,
      unresolvedRefs,
      fresh: Boolean(parsed.fresh),
      look: look.length ? look : undefined,
      answer:
        typeof parsed.answer === "string" && parsed.answer.trim()
          ? parsed.answer.trim().slice(0, 2000)
          : undefined,
    };
  } catch {
    return null;
  }
}

/** Deterministic PLAN fallback when FM is unavailable (tests / offline). */
export function planFromHydrateHeuristic(hydrate: HydrateResult): Plan {
  const urls = hydrate.urls;
  const fresh =
    /\b(today|this year|current|latest|news|score|weather|start|semester|schedule)\b/i.test(
      hydrate.userText,
    ) || hydrate.resolved.some((r) => /this year|today/i.test(r));

  if (urls.length === 1) {
    const u = urls[0]!;
    return {
      intent: `inspect ${u.domain} and summarize what it offers`,
      asks: [`Summarize ${u.domain}`],
      constraints: [],
      resolvedRefs: hydrate.resolved.length
        ? hydrate.resolved
        : [`it = ${u.domain}`],
      unresolvedRefs: hydrate.unresolved,
      fresh: false,
      look: [{ cap: "WEB", q: u.url }],
    };
  }

  const look: Lookup[] = [];
  if (fresh || /\b(when|what|how far|distance|calories|news)\b/i.test(hydrate.userText)) {
    const q = hydrate.topicHint
      ? `${hydrate.userText} (${hydrate.topicHint}, ${hydrate.year})`
      : `${hydrate.userText} ${hydrate.year}`;
    look.push({ cap: "WEB", q: q.slice(0, 400) });
  }

  // Distance / calc pattern
  if (/\b(how far|distance|miles|km|round[- ]?trip|there and back)\b/i.test(hydrate.userText)) {
    look.push({ cap: "CALC", q: hydrate.userText.slice(0, 400) });
  }

  return {
    intent: hydrate.userText.slice(0, 400),
    asks: [hydrate.userText.slice(0, 300)],
    constraints: [],
    resolvedRefs: hydrate.resolved,
    unresolvedRefs: hydrate.unresolved,
    fresh,
    look: look.length ? look : undefined,
  };
}

const PLAN_INSTRUCTIONS = [
  "You interpret the user message once. Return ONLY a JSON object matching this schema:",
  '{ "intent": string, "asks": string[], "constraints": string[], "resolvedRefs": string[], "unresolvedRefs": string[], "fresh": boolean, "look"?: [{ "cap": "WEB"|"MEMORY"|"FILES"|"CALENDAR"|"EMAIL"|"CRM"|"CALC"|"BUILD", "q": string }], "answer"?: string }',
  "",
  "Rules:",
  "- Preserve full semantic intent. Do not over-split filler language.",
  "- Keep entities, actions, pronouns, and URLs bound together.",
  "- Never create a lookup whose query is only filler like \"tell me about it\".",
  "- For URL/site inspection use look: [{ cap: \"WEB\", q: \"https://domain...\" }].",
  "- Mark time-sensitive / current facts as fresh=true and include WEB lookups.",
  "- Use conversation notes for follow-ups (e.g. first day under BYU topic).",
  "- Mark ambiguity in unresolvedRefs; never invent bindings.",
  "- Choose minimum required capabilities only.",
  "- Only set answer when no retrieval is needed (greetings, pure opinion).",
  "- Do not execute tools. Do not invent live facts.",
].join("\n");

export async function planTurn(opts: {
  hydrate: HydrateResult;
  generate?: (prompt: string, instructions: string) => Promise<string>;
  useHeuristicOnly?: boolean;
}): Promise<{ plan: Plan; raw?: string; usedHeuristic: boolean }> {
  if (opts.useHeuristicOnly || !opts.generate) {
    return {
      plan: planFromHydrateHeuristic(opts.hydrate),
      usedHeuristic: true,
    };
  }

  const generate =
    opts.generate ??
    (async (prompt: string, instructions: string) => {
      const { generateFmTurn } = await import("../runtime/native/fm-generate.ts");
      const fm = await generateFmTurn({ prompt, instructions });
      return fm.text;
    });

  let raw = await generate(opts.hydrate.planPrompt, PLAN_INSTRUCTIONS);
  let plan = parsePlanJson(raw);
  if (!plan) {
    raw = await generate(
      `${opts.hydrate.planPrompt}\n\nPrevious output was invalid JSON. Return only the Plan JSON object.`,
      PLAN_INSTRUCTIONS,
    );
    plan = parsePlanJson(raw);
  }
  if (!plan) {
    return {
      plan: planFromHydrateHeuristic(opts.hydrate),
      raw,
      usedHeuristic: true,
    };
  }
  return { plan, raw, usedHeuristic: false };
}
