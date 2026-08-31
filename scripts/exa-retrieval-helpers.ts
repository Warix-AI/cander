/**
 * Test helper — mirrors orchestrator tryExaDirectAnswer for unit tests.
 */
import {
  extractRequestedItemCount,
  inferResponseContract,
} from "../lib/ai/answer-shape/index.ts";
import type { TurnEvidence } from "../lib/ai/orchestrator/evidence.ts";

export function tryExaDirectAnswer(
  question: string,
  evidence: TurnEvidence[],
): string | null {
  const direct = evidence.find(
    (e) =>
      e.ok &&
      e.kind === "exa_synthesis" &&
      e.content.trim().length >= 8 &&
      e.groundingConfidence !== "low",
  );
  if (!direct) return null;
  const contract = inferResponseContract(question);
  if (
    contract.presentation === "list" ||
    contract.presentation === "bullet_list" ||
    extractRequestedItemCount(question) != null ||
    /\b(list\s+(every|all|each)|show\s+(me\s+)?(all|every))\b/i.test(question)
  ) {
    return null;
  }
  return direct.content.trim();
}
