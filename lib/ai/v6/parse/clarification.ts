import type { ParseOutcome } from "../types.ts";

export function clarificationOutcome(
  ambiguity: {
    phrase: string;
    candidates?: string[];
    question: string;
  },
): ParseOutcome {
  return { type: "clarification_required", ambiguity };
}
