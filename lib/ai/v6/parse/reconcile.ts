/**
 * Parse coverage reconciliation — surface spans ↔ parsed requests.
 */

import type {
  ParseCoverage,
  ParseOutcome,
  SurfaceExpectation,
  TurnSpec,
} from "../types.ts";

export function computeParseCoverage(
  surface: SurfaceExpectation,
  outcome: ParseOutcome,
): ParseCoverage {
  const probable = surface.spans.filter((s) => s.type === "probable_request");
  const surfaceSpanCount = probable.length;

  if (outcome.type === "clarification_required") {
    return {
      surfaceSpanCount,
      coveredSpanIds: probable.map((s) => s.id),
      uncoveredSpanIds: [],
      status: "ambiguous",
    };
  }

  const covered = new Set<string>();
  for (const r of outcome.spec.requests) {
    for (const id of r.surfaceSpanIds ?? []) covered.add(id);
  }

  // Heuristic fallback: if model omitted surfaceSpanIds but request count matches
  if (covered.size === 0 && outcome.spec.requests.length === surfaceSpanCount) {
    probable.forEach((s, i) => {
      const req = outcome.spec.requests[i];
      if (req) {
        req.surfaceSpanIds = [s.id];
        covered.add(s.id);
      }
    });
  }

  const coveredSpanIds = probable.filter((s) => covered.has(s.id)).map((s) => s.id);
  const uncoveredSpanIds = probable
    .filter((s) => !covered.has(s.id))
    .map((s) => s.id);

  return {
    surfaceSpanCount,
    coveredSpanIds,
    uncoveredSpanIds,
    status: uncoveredSpanIds.length === 0 ? "complete" : "incomplete",
  };
}

export function attachMissingSpanIds(
  spec: TurnSpec,
  surface: SurfaceExpectation,
): TurnSpec {
  const probable = surface.spans.filter((s) => s.type === "probable_request");
  const used = new Set(
    spec.requests.flatMap((r) => r.surfaceSpanIds ?? []),
  );
  const unused = probable.filter((s) => !used.has(s.id));
  if (!unused.length) return spec;

  // If fewer requests than spans, leave for repair; if equal, zip
  if (spec.requests.length === probable.length) {
    return {
      ...spec,
      requests: spec.requests.map((r, i) => ({
        ...r,
        surfaceSpanIds: r.surfaceSpanIds?.length
          ? r.surfaceSpanIds
          : [probable[i]!.id],
      })),
    };
  }
  return spec;
}
