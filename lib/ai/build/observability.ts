/**
 * Dev-only Build observability — intent vs result.
 */

import type { BuildObservations, BuildSpec, BuildSpecDelta, TurnPlan } from "./types.ts";
import type { BuildValidationState } from "./types.ts";

export type BuildTurnLog = {
  requestedChange: string;
  projectId: string | null;
  requiresBuildCapabilities: boolean;
  buildSpecBeforeVersion: number | null;
  buildSpecAfterVersion: number | null;
  resolvedDelta: BuildSpecDelta | null;
  turnPlan: TurnPlan | null;
  toolsSelected: string[];
  toolsExecuted: string[];
  sandboxSessionId: string | null;
  filesChanged: string[];
  validation: BuildValidationState | null;
  completionCriteria: BuildValidationState["criteria"] | null;
  retryCount: number;
  escalationReason: string | null;
  finalResult: "success" | "failed" | "clarify" | "skipped";
};

let sink: ((log: BuildTurnLog) => void) | null = null;
const buffer: BuildTurnLog[] = [];

export function setBuildLogSink(fn: ((log: BuildTurnLog) => void) | null): void {
  sink = fn;
}

export function resetBuildLogsForTests(): void {
  buffer.length = 0;
  sink = null;
}

export function getBuildLogsForTests(): BuildTurnLog[] {
  return [...buffer];
}

export function logBuildTurn(log: BuildTurnLog): void {
  buffer.push(log);
  if (buffer.length > 200) buffer.shift();
  sink?.(log);
  if (
    typeof process !== "undefined" &&
    process.env.CANDER_BUILD_DEBUG === "1"
  ) {
    console.info("[cander:build]", JSON.stringify(log));
  }
}

export function buildTurnLogFromParts(opts: {
  content: string;
  projectId: string | null;
  requiresBuildCapabilities: boolean;
  before: BuildSpec | null;
  after: BuildSpec | null;
  delta: BuildSpecDelta | null;
  plan: TurnPlan | null;
  observations: BuildObservations | null;
  validation: BuildValidationState | null;
  finalResult: BuildTurnLog["finalResult"];
  escalationReason?: string | null;
}): BuildTurnLog {
  return {
    requestedChange: opts.content,
    projectId: opts.projectId,
    requiresBuildCapabilities: opts.requiresBuildCapabilities,
    buildSpecBeforeVersion: opts.before?.buildSpecVersion ?? null,
    buildSpecAfterVersion: opts.after?.buildSpecVersion ?? null,
    resolvedDelta: opts.delta,
    turnPlan: opts.plan,
    toolsSelected: opts.observations?.toolsSelected ?? [],
    toolsExecuted: opts.observations?.toolsExecuted ?? [],
    sandboxSessionId: opts.observations?.sandbox?.sessionId ?? null,
    filesChanged: (opts.observations?.filesChanged ?? []).map((f) => f.path),
    validation: opts.validation,
    completionCriteria: opts.validation?.criteria ?? null,
    retryCount: opts.observations?.retryCount ?? 0,
    escalationReason: opts.escalationReason ?? null,
    finalResult: opts.finalResult,
  };
}
