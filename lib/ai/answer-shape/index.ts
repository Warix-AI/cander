/**
 * Client re-export of shared answer-shaping contract.
 * Source of truth: supabase/functions/_shared/answer-shape/
 */

export type {
  AnswerShape,
  AnswerShapeKind,
  CompactEvidenceItem,
  EvidenceBudgetProfile,
} from "../../../supabase/functions/_shared/answer-shape/types.ts";

export type {
  ResponseContract,
  ResponseDepth,
  ResponseValidation,
  AnswerPresentation,
  InferResponseContractHints,
} from "../../../supabase/functions/_shared/answer-shape/response-contract.ts";

export { ANSWER_SHAPE_BUDGETS } from "../../../supabase/functions/_shared/answer-shape/types.ts";
export { inferAnswerShape } from "../../../supabase/functions/_shared/answer-shape/infer.ts";
export {
  answerShapeFromContract,
  buildCompletionRepairInstruction,
  countListItems,
  extractRequestedItemCount,
  inferResponseContract,
  inferResponseDepth,
  mergeCompletionDraft,
  validateResponseContract,
} from "../../../supabase/functions/_shared/answer-shape/response-contract.ts";
export {
  authorityScore,
  compressEvidenceForSynthesis,
  extractRelevantExcerpt,
  shrinkEvidenceForRetry,
  stripEvidenceNoise,
  type RawEvidenceInput,
} from "../../../supabase/functions/_shared/answer-shape/compress.ts";
export {
  SEARCH_SYNTHESIS_RULES,
  buildSynthesisInstruction,
  deterministicAnswerFromEvidence,
  formatCompactEvidenceBlock,
  looksLikeContextOverflow,
} from "../../../supabase/functions/_shared/answer-shape/synthesis.ts";
