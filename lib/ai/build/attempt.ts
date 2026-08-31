/**
 * Working-attempt helpers — apply candidate delta in memory without committing.
 */

import { applyBuildSpecDelta, findPageByRoute } from "./build-spec.ts";
import {
  mayClaimBuildSuccess,
  validateBuildCompletion,
} from "./completion.ts";
import {
  commitValidatedBuildSpecDelta,
  getBuildExecutionState,
  loadBuildSpec,
  recordFailedAttempt,
} from "./store.ts";
import type {
  BuildObservations,
  BuildSpec,
  BuildSpecDelta,
  BuildValidationState,
  TurnPlan,
} from "./types.ts";

export function newAttemptId(): string {
  return `attempt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyObservations(opts: {
  projectId: string;
  attemptId?: string;
}): BuildObservations {
  return {
    attemptId: opts.attemptId ?? newAttemptId(),
    projectId: opts.projectId,
    startedAt: new Date().toISOString(),
    filesChanged: [],
    commands: [],
    errors: [],
    retryCount: 0,
    toolsSelected: [],
    toolsExecuted: [],
  };
}

/**
 * Simulate a successful sandbox validate for routine unit/trajectory tests.
 */
export function observationsWithSuccessfulBuild(
  projectId: string,
  extra?: Partial<BuildObservations>,
): BuildObservations {
  const base = emptyObservations({ projectId });
  return {
    ...base,
    ...extra,
    commands: [
      ...(extra?.commands ?? []),
      {
        command: "npm",
        args: ["run", "build"],
        exitCode: 0,
        stdout: "compiled successfully",
      },
    ],
    errors: extra?.errors ?? [],
  };
}

export function observationsWithFailedBuild(
  projectId: string,
  error = "build failed",
): BuildObservations {
  return {
    ...emptyObservations({ projectId }),
    commands: [
      {
        command: "npm",
        args: ["run", "build"],
        exitCode: 1,
        stderr: error,
      },
    ],
    errors: [error],
  };
}

/**
 * Produce candidate spec from pending delta without committing.
 */
export function materializeWorkingSpec(
  validated: BuildSpec,
  delta: BuildSpecDelta | null | undefined,
): BuildSpec {
  if (!delta) return validated;
  return applyBuildSpecDelta(validated, delta);
}

export type CommitBuildAttemptResult =
  | {
      ok: true;
      before: BuildSpec;
      after: BuildSpec;
      validation: BuildValidationState;
      claimedSuccess: true;
    }
  | {
      ok: false;
      before: BuildSpec | null;
      validation: BuildValidationState;
      claimedSuccess: false;
      error: string;
    };

/**
 * Validate then commit — failed attempts leave canonical BuildSpec unchanged.
 */
export function finalizeBuildAttempt(opts: {
  projectId: string;
  plan: TurnPlan;
  delta: BuildSpecDelta | null;
  observations: BuildObservations;
}): CommitBuildAttemptResult {
  const before = loadBuildSpec(opts.projectId);
  if (!before) {
    return {
      ok: false,
      before: null,
      validation: validateBuildCompletion(opts.plan, opts.observations, null),
      claimedSuccess: false,
      error: "no_build_spec",
    };
  }

  const candidate = materializeWorkingSpec(before, opts.delta);

  // Evaluate against an immutable plan copy for remove-pricing custom criterion.
  const planForValidation =
    opts.plan.objective === "remove_pricing_page"
      ? {
          ...opts.plan,
          completionCriteria: opts.plan.completionCriteria.map((c) => {
            if (c.id !== "pricing_gone" || c.kind !== "custom") return c;
            const stillThere = findPageByRoute(candidate, "/pricing");
            return {
              ...c,
              params: { ...(c.params ?? {}), passed: !stillThere },
            };
          }),
        }
      : opts.plan;

  const validation = validateBuildCompletion(
    planForValidation,
    opts.observations,
    candidate,
  );

  if (!mayClaimBuildSuccess(validation) || !opts.delta) {
    recordFailedAttempt(opts.projectId, opts.observations, validation);
    return {
      ok: false,
      before,
      validation,
      claimedSuccess: false,
      error: validation.allPassed ? "no_delta" : "validation_failed",
    };
  }

  const committed = commitValidatedBuildSpecDelta(opts.projectId, opts.delta);
  if (!committed.ok) {
    recordFailedAttempt(opts.projectId, opts.observations, validation);
    return {
      ok: false,
      before,
      validation,
      claimedSuccess: false,
      error: committed.error,
    };
  }

  return {
    ok: true,
    before: committed.before,
    after: committed.after,
    validation,
    claimedSuccess: true,
  };
}

export function validatedDraftSurvived(projectId: string): {
  version: number;
  spec: BuildSpec | null;
} {
  const spec = loadBuildSpec(projectId);
  const ex = getBuildExecutionState(projectId);
  return {
    version: spec?.buildSpecVersion ?? ex.validatedSpecVersion,
    spec,
  };
}
