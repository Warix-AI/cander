/**
 * In-memory BuildSpec store for tests + local path.
 * Canonical Validated Draft only — failed attempts never write here.
 */

import {
  commitBuildSpecDelta,
  emptyBuildSpec,
  validateBuildSpecDelta,
} from "./build-spec.ts";
import type {
  BuildExecutionState,
  BuildObservations,
  BuildSpec,
  BuildSpecDelta,
  BuildValidationState,
  SandboxSessionRef,
} from "./types.ts";

const specs = new Map<string, BuildSpec>();
const execution = new Map<string, BuildExecutionState>();

export function resetBuildSpecStoreForTests(): void {
  specs.clear();
  execution.clear();
}

export function emptySandboxRef(projectId: string): SandboxSessionRef {
  return {
    projectId,
    sessionId: null,
    status: "none",
    lastUsedAt: null,
    previewUrl: null,
    specVersion: null,
  };
}

export function emptyExecutionState(projectId: string): BuildExecutionState {
  return {
    projectId,
    validatedSpecVersion: 0,
    workingAttemptId: null,
    observations: null,
    validation: null,
    sandbox: emptySandboxRef(projectId),
  };
}

export function loadBuildSpec(projectId: string): BuildSpec | null {
  return specs.get(projectId) ?? null;
}

export function ensureBuildSpec(opts: {
  projectId: string;
  goal?: string;
  projectType?: BuildSpec["projectType"];
}): BuildSpec {
  const existing = specs.get(opts.projectId);
  if (existing) return existing;
  const created = emptyBuildSpec(opts);
  specs.set(opts.projectId, created);
  const ex = emptyExecutionState(opts.projectId);
  ex.validatedSpecVersion = created.buildSpecVersion;
  execution.set(opts.projectId, ex);
  return created;
}

export function getBuildExecutionState(
  projectId: string,
): BuildExecutionState {
  return execution.get(projectId) ?? emptyExecutionState(projectId);
}

/**
 * Commit only after validation passed. Returns null if delta invalid.
 * Failed attempts must call recordFailedAttempt instead.
 */
export function commitValidatedBuildSpecDelta(
  projectId: string,
  delta: BuildSpecDelta,
):
  | { ok: true; before: BuildSpec; after: BuildSpec }
  | { ok: false; error: string } {
  const before = specs.get(projectId);
  if (!before) return { ok: false, error: "no_build_spec" };
  const check = validateBuildSpecDelta(before, delta);
  if (!check.ok) return check;
  const after = commitBuildSpecDelta(before, delta);
  specs.set(projectId, after);
  const ex = getBuildExecutionState(projectId);
  execution.set(projectId, {
    ...ex,
    validatedSpecVersion: after.buildSpecVersion,
    workingAttemptId: null,
  });
  return { ok: true, before, after };
}

export function recordFailedAttempt(
  projectId: string,
  observations: BuildObservations,
  validation: BuildValidationState,
): BuildSpec | null {
  const before = specs.get(projectId) ?? null;
  const ex = getBuildExecutionState(projectId);
  execution.set(projectId, {
    ...ex,
    workingAttemptId: observations.attemptId,
    observations,
    validation,
  });
  // Canonical Validated Draft unchanged
  return before;
}

export function upsertSandboxSessionRef(
  projectId: string,
  patch: Partial<SandboxSessionRef>,
): SandboxSessionRef {
  const ex = getBuildExecutionState(projectId);
  const sandbox: SandboxSessionRef = {
    ...ex.sandbox,
    ...patch,
    projectId,
  };
  execution.set(projectId, { ...ex, sandbox });
  return sandbox;
}

/** Test helper: seed a spec without going through ensure. */
export function seedBuildSpec(spec: BuildSpec): void {
  specs.set(spec.projectId, spec);
  const ex = emptyExecutionState(spec.projectId);
  ex.validatedSpecVersion = spec.buildSpecVersion;
  execution.set(spec.projectId, ex);
}
