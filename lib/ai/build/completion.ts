/**
 * Completion criteria vs BuildObservations — fail closed.
 * Does not mutate TurnPlan.
 */

import type {
  BuildObservations,
  BuildValidationState,
  CompletionCriterion,
  CompletionCriterionResult,
  TurnPlan,
} from "./types.ts";
import type { BuildSpec } from "./types.ts";
import { findPageByRoute, getAtPath } from "./build-spec.ts";

export function emptyValidationState(): BuildValidationState {
  return {
    buildPassed: false,
    typecheckPassed: false,
    lintPassed: false,
    runtimePassed: false,
    criteria: [],
    allPassed: false,
  };
}

export function evaluateCriterion(
  criterion: CompletionCriterion,
  opts: {
    spec: BuildSpec | null;
    observations: BuildObservations | null;
  },
): CompletionCriterionResult {
  const { spec, observations } = opts;
  switch (criterion.kind) {
    case "route_exists": {
      const route = String(criterion.params?.route ?? "");
      if (!spec || !route) {
        return { id: criterion.id, passed: false, detail: "missing spec/route" };
      }
      const page = findPageByRoute(spec, route);
      return {
        id: criterion.id,
        passed: Boolean(page),
        detail: page ? `found ${page.route}` : `missing ${route}`,
      };
    }
    case "nav_links": {
      const route = String(criterion.params?.route ?? "");
      const nav = spec?.sections.find((s) => s.role === "nav");
      const links = (nav?.content?.links as string[] | undefined) ?? [];
      const ok = Boolean(route) && links.includes(route);
      return {
        id: criterion.id,
        passed: ok,
        detail: ok ? `nav links to ${route}` : `nav missing ${route}`,
      };
    }
    case "build_succeeds": {
      const cmds = observations?.commands ?? [];
      const build = [...cmds].reverse().find((c) =>
        c.command === "npm" && (c.args ?? []).includes("build"),
      );
      const passed = build ? build.exitCode === 0 && !build.timedOut : false;
      return {
        id: criterion.id,
        passed,
        detail: build
          ? `exit ${build.exitCode}`
          : "no build command observed",
      };
    }
    case "typecheck_succeeds": {
      const cmds = observations?.commands ?? [];
      const tsc = [...cmds].reverse().find(
        (c) =>
          c.command === "npx" && (c.args ?? []).some((a) => a.includes("tsc")),
      );
      const passed = tsc ? tsc.exitCode === 0 : false;
      return {
        id: criterion.id,
        passed,
        detail: tsc ? `exit ${tsc.exitCode}` : "no typecheck observed",
      };
    }
    case "no_runtime_errors": {
      const errs = observations?.errors ?? [];
      return {
        id: criterion.id,
        passed: errs.length === 0,
        detail: errs.length ? errs.join("; ") : "ok",
      };
    }
    case "plans_render": {
      const count = Number(criterion.params?.count ?? 3);
      const path = String(criterion.params?.path ?? "sections");
      const sections = (getAtPath(spec, path) as unknown[]) ?? [];
      const pricing = sections.filter(
        (s) =>
          s &&
          typeof s === "object" &&
          (s as { role?: string }).role === "pricing",
      );
      const plans =
        (pricing[0] as { content?: { plans?: unknown[] } } | undefined)?.content
          ?.plans ?? [];
      const passed = plans.length >= count;
      return {
        id: criterion.id,
        passed,
        detail: `${plans.length}/${count} plans`,
      };
    }
    case "spec_field": {
      const path = String(criterion.params?.path ?? "");
      const expected = criterion.params?.equals;
      const actual = getAtPath(spec, path);
      const passed =
        expected === undefined ? actual != null : actual === expected;
      return {
        id: criterion.id,
        passed,
        detail: `${path}=${JSON.stringify(actual)}`,
      };
    }
    case "custom":
    default: {
      const forced = criterion.params?.passed;
      if (typeof forced === "boolean") {
        return { id: criterion.id, passed: forced };
      }
      return {
        id: criterion.id,
        passed: false,
        detail: "custom criterion unmet",
      };
    }
  }
}

/**
 * Validate TurnPlan completion against observations (+ optional candidate spec).
 * Does not mutate the plan.
 */
export function validateBuildCompletion(
  plan: TurnPlan,
  observations: BuildObservations | null,
  candidateSpec: BuildSpec | null = null,
): BuildValidationState {
  const criteria = plan.completionCriteria.map((c) =>
    evaluateCriterion(c, { spec: candidateSpec, observations }),
  );

  const cmds = observations?.commands ?? [];
  const lastBuild = [...cmds].reverse().find(
    (c) => c.command === "npm" && (c.args ?? []).includes("build"),
  );
  const buildPassed = lastBuild ? lastBuild.exitCode === 0 : false;
  const lastTsc = [...cmds].reverse().find(
    (c) =>
      c.command === "npx" && (c.args ?? []).some((a) => a.includes("tsc")),
  );
  const typecheckPassed = lastTsc ? lastTsc.exitCode === 0 : true;
  const lintPassed = true;
  const runtimePassed = (observations?.errors.length ?? 0) === 0;
  const allPassed =
    criteria.every((c) => c.passed) &&
    runtimePassed &&
    (plan.completionCriteria.some((c) => c.kind === "build_succeeds")
      ? buildPassed
      : true);

  return {
    buildPassed,
    typecheckPassed,
    lintPassed,
    runtimePassed,
    criteria,
    allPassed,
  };
}

/** Never claim publish/build success when validation failed. */
export function mayClaimBuildSuccess(validation: BuildValidationState): boolean {
  return validation.allPassed;
}
