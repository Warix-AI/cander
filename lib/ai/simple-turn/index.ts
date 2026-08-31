export type {
  AnswerPacket,
  AnswerShape,
  BrowserMode,
  Cap,
  CheckResult,
  CommitNotes,
  EvidenceVerifyScore,
  HydrateResult,
  Intent,
  IntentAction,
  IntentCondition,
  IntentNeedsFrom,
  IntentPlan,
  IntentResult,
  IntentResultStatus,
  Lookup,
  Plan,
  PlanValidation,
  SimpleEvidence,
  SimpleState,
  SimpleTurnTerminal,
} from "./types.ts";

export {
  actionToCap,
  intentPlanToPlan,
  isIntentAction,
  normalizeCondition,
  normalizeIntentPlan,
  normalizeNeedsFrom,
  syncPlanAliases,
} from "./types.ts";

export { hydrateTurn } from "./hydrate.ts";
export {
  planTurn,
  parsePlanJson,
  parseIntentPlanJson,
  planFromHydrateHeuristic,
  intentPlanFromHydrateHeuristic,
  heuristicConditionalCalendarPlan,
  interpretSelfCheck,
  classifyDeliberationDepth,
  buildInterpretInstructions,
} from "./plan.ts";
export type { DeliberationDepth, PlanHealth } from "./deliberation.ts";
export { buildPlanHealth } from "./deliberation.ts";
export {
  validatePlan,
  validateIntentPlan,
  repairPlanCode,
  repairIntentPlanCode,
  validateAndRepairPlan,
} from "./validate-plan.ts";
export {
  runLookups,
  intentExecutionWaves,
  evaluateIntentCondition,
  extractNeedsPayload,
  effectiveDependsOn,
} from "./run.ts";
export {
  checkEvidence,
  verifyEvidence,
  verifyIntentEvidence,
  scoreEvidence,
  isSensitiveCurrentFact,
  buildCorroborationLookups,
  authorityScore,
} from "./check.ts";
export {
  buildCanonicalLookupQuery,
  looksLikeNarrativeQuery,
  heuristicCalorieIntents,
} from "./query-normalize.ts";
export { answerTurn, mergeCommitNotes } from "./answer.ts";
export { commitTurnNotes } from "./commit.ts";
export {
  loadSimpleState,
  commitSimpleNotes,
  resetSimpleStateForTests,
} from "./state-store.ts";
export { runSimpleTurnRuntime } from "./runtime.ts";
export { isSimpleTurnRuntimeEnabled } from "../orchestrator/flags.ts";
