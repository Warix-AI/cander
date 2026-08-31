/**
 * Cander AI Runtime V6 — public entry.
 */

export { runTurn } from "./run-turn.ts";
export type { RunTurnOptions, V6TurnResult } from "./run-turn.ts";
export { isV6RuntimeEnabled } from "./flags.ts";
export * from "./types.ts";

export { surfacePrepass } from "./surface/prepass.ts";
export { computeParseCoverage } from "./parse/reconcile.ts";
export { heuristicParse } from "./parse/apple-parse.ts";
export {
  normalizeRequests,
  canonicalizeProperty,
} from "./normalize/canonicalize.ts";
export { planSource, getPolicy, POLICY_TABLE } from "./normalize/policies.ts";
export { computeUserCoverage } from "./coverage/user-coverage.ts";
export { evaluateExpression } from "./derive/expressions.ts";
export { buildRequestGraph } from "./graph/build.ts";
export { expandMapDependencies } from "./graph/expand-map.ts";
export { resolveEvidenceConflict } from "./verify/conflict.ts";
export { MAX_MAP_EXPANSION } from "./types.ts";
export { clearMemoryStore, loadMemoryDelta } from "./memory/commit.ts";
