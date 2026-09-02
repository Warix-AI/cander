/**
 * Resolve follow-ups against normalized ToolReference history.
 * Family-agnostic — does not know Gmail/Slack payload shapes.
 */

import type { ToolReference } from "@/lib/ai/tools/types";

export type ReferenceResolution =
  | { ok: true; reference: ToolReference; index: number }
  | { ok: false; reason: "not_found" | "ambiguous"; message: string };

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  last: -1,
};

export function filterReferencesByType(
  refs: ToolReference[],
  types: string[],
): ToolReference[] {
  const set = new Set(types);
  return refs.filter((r) => set.has(r.type));
}

export function resolveOrdinalReference(
  refs: ToolReference[],
  text: string,
  preferredTypes?: string[],
): ReferenceResolution {
  const pool = preferredTypes?.length
    ? filterReferencesByType(refs, preferredTypes)
    : refs;
  if (!pool.length) {
    return { ok: false, reason: "not_found", message: "No prior items to reference." };
  }

  const lower = text.toLowerCase();
  let ordinal: number | null = null;
  for (const [word, value] of Object.entries(ORDINAL_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) {
      ordinal = value;
      break;
    }
  }
  const digit = lower.match(/\b(?:#|number\s*)?(\d+)(?:st|nd|rd|th)?\b/);
  if (ordinal == null && digit) {
    ordinal = Number(digit[1]);
  }

  if (ordinal == null) {
    if (/\b(that|it|this|the (email|message|thread|deal|file))\b/i.test(text)) {
      return { ok: true, reference: pool[0]!, index: 0 };
    }
    return {
      ok: false,
      reason: "ambiguous",
      message: "Could not determine which item you mean.",
    };
  }

  if (ordinal === -1) {
    const index = pool.length - 1;
    return { ok: true, reference: pool[index]!, index };
  }

  const index = ordinal - 1;
  if (index < 0 || index >= pool.length) {
    return {
      ok: false,
      reason: "not_found",
      message: `No item at position ${ordinal}.`,
    };
  }
  return { ok: true, reference: pool[index]!, index };
}

export function suggestToolsForReference(
  reference: ToolReference,
): string[] {
  switch (reference.type) {
    case "email_message":
      return ["gmail.read", "gmail.reply"];
    case "email_thread":
      return ["gmail.reply", "gmail.search"];
    case "slack_message":
      return ["slack.read", "slack.send"];
    case "slack_channel":
      return ["slack.send", "slack.search"];
    case "hubspot_deal":
      return ["hubspot.deals.update"];
    case "calendar_event":
      return ["calendar.events.update", "calendar.events.delete"];
    default:
      return [];
  }
}

export function formatReferencesForPrompt(refs: ToolReference[]): string {
  if (!refs.length) return "";
  const lines = ["Recent tool references (use ids, do not invent):"];
  refs.slice(0, 20).forEach((ref, i) => {
    lines.push(
      `${i + 1}. type=${ref.type} id=${ref.id}${ref.label ? ` label="${ref.label}"` : ""}`,
    );
  });
  return lines.join("\n");
}
