/**
 * Stage 12 — User coverage gate (original spans ↔ outcomes).
 */

import type {
  ParseOutcome,
  RequestResult,
  SurfaceExpectation,
  TurnSpec,
  UserCoverage,
  UserCoverageSpanStatus,
} from "../types.ts";

export function computeUserCoverage(args: {
  surface: SurfaceExpectation;
  spec: TurnSpec | null;
  results: RequestResult[];
  parseOutcome: ParseOutcome;
}): UserCoverage {
  const resultByReq = new Map(args.results.map((r) => [r.requestId, r]));

  if (args.parseOutcome.type === "clarification_required") {
    return {
      surfaceSpans: args.surface.spans.map((s) => ({
        spanId: s.id,
        status:
          s.type === "probable_request"
            ? ("clarification_needed" as const)
            : ("non_request" as const),
        requestIds: [],
      })),
      complete: false,
    };
  }

  const spec = args.spec!;
  const surfaceSpans = args.surface.spans.map((span) => {
    if (span.type !== "probable_request") {
      return {
        spanId: span.id,
        status: "non_request" as UserCoverageSpanStatus,
        requestIds: [],
      };
    }

    const requestIds = spec.requests
      .filter((r) => r.surfaceSpanIds?.includes(span.id))
      .map((r) => r.id);

    // Include map expansions sharing mapParent
    for (const r of args.results) {
      const req = spec.requests.find((x) => x.id === r.requestId);
      if (req?.surfaceSpanIds?.includes(span.id)) continue;
      // expansions: id like r2_1 linked via parent surface
      const parentId = r.requestId.replace(/_\d+$/, "");
      if (requestIds.includes(parentId) && !requestIds.includes(r.requestId)) {
        requestIds.push(r.requestId);
      }
    }

    if (!requestIds.length) {
      return {
        spanId: span.id,
        status: "unresolved" as UserCoverageSpanStatus,
        requestIds: [],
      };
    }

    const statuses = requestIds.map(
      (id) => resultByReq.get(id)?.status ?? "unresolved",
    );

    let status: UserCoverageSpanStatus = "answered";
    if (statuses.every((s) => s === "blocked_upstream")) status = "blocked";
    else if (
      statuses.every(
        (s) =>
          s === "unresolved" ||
          s === "conflicting" ||
          s === "blocked_upstream",
      )
    ) {
      status = statuses.includes("blocked_upstream") ? "blocked" : "unresolved";
    } else if (
      statuses.some(
        (s) =>
          s === "unresolved" ||
          s === "conflicting" ||
          s === "blocked_upstream",
      )
    ) {
      // Partial — still mark answered if any success, but coverage incomplete
      const anyOk = statuses.some(
        (s) => s === "verified" || s === "policy_trusted",
      );
      status = anyOk ? "answered" : "unresolved";
    }

    return { spanId: span.id, status, requestIds };
  });

  const probable = surfaceSpans.filter((s) => {
    const span = args.surface.spans.find((x) => x.id === s.spanId);
    return span?.type === "probable_request";
  });

  const complete = probable.every(
    (s) => s.status === "answered" || s.status === "non_request",
  );

  return { surfaceSpans, complete };
}
