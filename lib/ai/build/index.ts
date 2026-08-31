/**
 * Build capability set — shared IR for local + Edge.
 * Normal turns must not import side effects from this package's store
 * unless requiresBuildCapabilities is true (callers gate).
 */

export type {
  BuildAuthConfig,
  BuildAutomation,
  BuildCapabilityResolution,
  BuildCommandObservation,
  BuildComponentRef,
  BuildDataModel,
  BuildDesignTokens,
  BuildExecutionState,
  BuildFileChange,
  BuildIntegration,
  BuildObservations,
  BuildPage,
  BuildProjectType,
  BuildSection,
  BuildSeo,
  BuildSpec,
  BuildSpecDelta,
  BuildSpecPath,
  BuildTaskComplexity,
  BuildValidationState,
  CompletionCriterion,
  CompletionCriterionResult,
  ProjectResolveResult,
  ProjectResolveStatus,
  SandboxSessionRef,
  SandboxSessionStatus,
  TurnPlan,
  TurnPlanOperation,
} from "./types.ts";

export {
  applyBuildSpecDelta,
  cloneBuildSpec,
  commitBuildSpecDelta,
  compileBuildSpecSlice,
  emptyBuildSpec,
  findPageByRoute,
  getAtPath,
  setAtPath,
  validateBuildSpecDelta,
} from "./build-spec.ts";

export {
  classifyBuildComplexity,
  isBuildCreateIntent,
  isBuildIntent,
  isBuildRefineIntent,
  resolveBuildCapabilities,
} from "./capabilities.ts";

export type { ResolveBuildCapabilitiesInput } from "./capabilities.ts";

export {
  resolveBuildProject,
} from "./project-resolve.ts";
export type {
  ProjectCandidate,
  ResolveBuildProjectInput,
} from "./project-resolve.ts";

export {
  inferRecipeId,
  resolvePendingDelta,
  resolveTurnPlan,
} from "./turn-plan.ts";
export type { ResolveTurnPlanInput } from "./turn-plan.ts";

export {
  emptyValidationState,
  evaluateCriterion,
  mayClaimBuildSuccess,
  validateBuildCompletion,
} from "./completion.ts";

export {
  commitValidatedBuildSpecDelta,
  emptyExecutionState,
  emptySandboxRef,
  ensureBuildSpec,
  getBuildExecutionState,
  loadBuildSpec,
  recordFailedAttempt,
  resetBuildSpecStoreForTests,
  seedBuildSpec,
  upsertSandboxSessionRef,
} from "./store.ts";

export {
  buildTurnLogFromParts,
  getBuildLogsForTests,
  logBuildTurn,
  resetBuildLogsForTests,
  setBuildLogSink,
} from "./observability.ts";
export type { BuildTurnLog } from "./observability.ts";

export {
  emptyObservations,
  finalizeBuildAttempt,
  materializeWorkingSpec,
  newAttemptId,
  observationsWithFailedBuild,
  observationsWithSuccessfulBuild,
  validatedDraftSurvived,
} from "./attempt.ts";

export {
  resolveBuildTurnContext,
  shouldRunBuildLocally,
} from "./turn-context.ts";
export type { BuildTurnContext, ResolveBuildTurnContextInput } from "./turn-context.ts";

export {
  runRoutineBuildMutation,
} from "./routine-mutation.ts";

export {
  applyRecipeToSpecFields,
  BACKEND_RECIPES,
  BUILD_RECIPES,
  canApplyRecipe,
  getBackendRecipe,
  getBuildRecipe,
  validateBackendRecipeSecurity,
} from "./recipes.ts";

export {
  createCanderCacheComponentProvider,
  createTwentyFirstDevProvider,
  normalizeComponentToDesignTokens,
  searchComponentsBounded,
} from "./component-provider.ts";
export type {
  ComponentCandidate,
  ComponentProvider,
} from "./component-provider.ts";

export { decideBuildEscalation } from "./escalation.ts";
export type { BuildEscalationDecision } from "./escalation.ts";

export { executeBuildTool } from "./tool-executors.ts";
