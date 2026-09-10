/**
 * Hard caps so no Build stage can loop unbounded (plan-first architecture).
 */

export const BUILD_RETRY_BUDGETS = {
  /** Search/get rounds per component role before catalog fallback. */
  researchRoundsPerRole: 3,
  /** Keep top-K scored candidates per role. */
  researchTopK: 5,
  /** Automated dependency/package repair commits. */
  dependencyRepair: 2,
  /** Preview ready auto-heal (ensure scaffold + forceRestart + recheck). */
  previewReadyHeal: 1,
  /** Primary Codex implementation passes. */
  codexImplementation: 1,
  /** Codex technical repair after validation fails. */
  codexTechnicalRepair: 2,
  /** Codex visual QA repair (desktop/tablet/mobile). */
  codexVisualRepair: 1,
  /** forceRestart allowed per create/open cycle. */
  sandboxForceRestart: 1,
  /** Publish: one ensure-project + one deploy attempt. */
  publishEnsureProject: 1,
  publishDeploy: 1,
  /** Publish compile preflight (tsc + next build) attempts per publish. */
  publishPreflightCompile: 1,
} as const;

export type BuildRetryBudgetKey = keyof typeof BUILD_RETRY_BUDGETS;
