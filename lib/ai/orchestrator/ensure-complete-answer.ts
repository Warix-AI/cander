/**
 * Ensure a generated answer satisfies the response contract.
 * Continues/repairs internally once; never returns a partial list when
 * mustComplete + requestedItemCount are set.
 */

import {
  buildCompletionRepairInstruction,
  inferResponseContract,
  mergeCompletionDraft,
  validateResponseContract,
  type ResponseContract,
} from "../answer-shape/index.ts";

export async function ensureCompleteAnswer(opts: {
  question: string;
  draft: string;
  generate: (instruction: string) => Promise<string>;
  contract?: ResponseContract;
}): Promise<{ content: string; repaired: boolean; contract: ResponseContract }> {
  const contract = opts.contract ?? inferResponseContract(opts.question);
  const first = opts.draft.trim();
  const check = validateResponseContract(first, contract);
  if (check.complete || !contract.mustComplete) {
    return { content: first, repaired: false, contract };
  }

  const instruction = buildCompletionRepairInstruction({
    question: opts.question,
    contract,
    partial: first,
  });
  let continuation = "";
  try {
    continuation = (await opts.generate(instruction)).trim();
  } catch {
    return { content: first, repaired: false, contract };
  }

  const merged = mergeCompletionDraft(first, continuation);
  const again = validateResponseContract(merged, contract);
  // Prefer the more complete of draft vs merge even if still shy of N.
  const best =
    again.foundCount >= check.foundCount ? merged : first;
  return { content: best, repaired: true, contract };
}
