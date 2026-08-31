/**
 * Apple renderer — natural phrasing from resolved / policy_trusted inputs only.
 */

import type { AnswerBundle } from "../types.ts";
import { renderDeterministic } from "./deterministic.ts";

export type AppleRenderFn = (
  prompt: string,
  instructions: string,
) => Promise<string>;

export async function renderApple(
  bundle: AnswerBundle,
  generate?: AppleRenderFn,
): Promise<string> {
  const facts = bundle.results
    .filter(
      (r) => r.status === "verified" || r.status === "policy_trusted",
    )
    .map((r) => `${r.requestId}: ${String(r.value).slice(0, 500)}`)
    .join("\n");

  const gaps = bundle.coverage.surfaceSpans
    .filter((s) => s.status !== "answered" && s.status !== "non_request")
    .map((s) => `${s.spanId}:${s.status}`)
    .join(", ");

  if (!generate) {
    return renderDeterministic(bundle);
  }

  const prompt = `Resolved inputs (do not invent facts):\n${facts}\n\nCoverage gaps to acknowledge: ${gaps || "none"}\n\nWrite a clear user-facing answer. Mention every gap explicitly.`;
  try {
    const text = await generate(
      prompt,
      "You phrase answers from provided resolved inputs only. Never invent citations or URLs.",
    );
    if (text.trim()) return text.trim();
  } catch {
    /* fall through */
  }
  return renderDeterministic(bundle);
}
