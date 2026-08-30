export type {
  AnswerShape,
  AnswerShapeKind,
  CompactEvidenceItem,
  EvidenceBudgetProfile,
} from "./types.ts";
export { ANSWER_SHAPE_BUDGETS } from "./types.ts";
export { inferAnswerShape } from "./infer.ts";
export {
  authorityScore,
  compressEvidenceForSynthesis,
  extractRelevantExcerpt,
  shrinkEvidenceForRetry,
  stripEvidenceNoise,
  type RawEvidenceInput,
} from "./compress.ts";
export {
  SEARCH_SYNTHESIS_RULES,
  buildSynthesisInstruction,
  deterministicAnswerFromEvidence,
  formatCompactEvidenceBlock,
  looksLikeContextOverflow,
} from "./synthesis.ts";
