/**
 * Renderer selection.
 */

import type { AnswerBundle, TurnSpec } from "../types.ts";

export type RendererKind = "deterministic" | "apple" | "cloud";

export function selectRenderer(args: {
  spec: TurnSpec;
  bundle: AnswerBundle;
  forceCloud?: boolean;
  hasImages?: boolean;
}): RendererKind {
  if (args.forceCloud || args.hasImages) return "cloud";

  const kinds = new Set(args.spec.requests.map((r) => r.kind));
  if (kinds.has("research") && args.spec.response.detail === "deep") {
    return "cloud";
  }

  const allSimple = [...kinds].every((k) =>
    ["fact", "calculate"].includes(k),
  );
  const hasExplain = kinds.has("explain") || kinds.has("summarize") || kinds.has("compare");

  const hasWebEvidence = args.bundle.evidence.some((e) => e.sourceType === "web");

  if (allSimple && !hasExplain) {
    // Raw search snippets are not user-facing answers — synthesize when web was used.
    if (hasWebEvidence) return args.forceCloud ? "cloud" : "apple";
    return "deterministic";
  }
  if (hasExplain || kinds.has("research")) return "apple";
  return "deterministic";
}
