/**
 * Conflict detection + authority-based resolution.
 * Prefer official/primary/newer; if still tied, surface disagreement.
 */

import type { Evidence } from "../types.ts";

export type ConflictResolution =
  | { type: "none" }
  | { type: "resolved"; evidenceId: string; value: unknown; reason: string }
  | { type: "conflicting"; reason: string; values: string[] };

export function resolveEvidenceConflict(
  evidence: Evidence[],
  requestId: string,
): ConflictResolution {
  const rows = evidence
    .filter((e) => e.scores[requestId])
    .map((e) => ({
      id: e.id,
      value: String(e.value ?? e.excerpt ?? "").trim(),
      authority: e.scores[requestId]?.authority ?? 0,
      observedAt: e.observedAt ? Date.parse(e.observedAt) : 0,
      url: e.source?.url,
    }))
    .filter((r) => r.value);

  if (rows.length < 2) return { type: "none" };

  const unique = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.value.toLowerCase();
    const list = unique.get(key) || [];
    list.push(r);
    unique.set(key, list);
  }
  if (unique.size <= 1) return { type: "none" };

  // Numeric near-equality only when both sides look like numbers
  const numericKeys = [...unique.keys()].filter((v) =>
    /^-?\d+(\.\d+)?$/.test(v.replace(/[^0-9.\-]/g, "")) &&
    v.replace(/[^0-9.\-]/g, "").length > 0,
  );
  if (numericKeys.length === unique.size && numericKeys.length >= 2) {
    const nums = numericKeys.map((v) => Number(v.replace(/[^0-9.\-]/g, "")));
    const max = Math.max(...nums);
    const min = Math.min(...nums);
    if (max - min < 0.01 * Math.max(1, max)) return { type: "none" };
  }

  // Prefer official primary (authority >= 90) over weaker secondaries
  const ranked = [...rows].sort((a, b) => {
    if (b.authority !== a.authority) return b.authority - a.authority;
    return b.observedAt - a.observedAt;
  });
  const best = ranked[0]!;
  const second = ranked.find(
    (r) => r.value.toLowerCase() !== best.value.toLowerCase(),
  );
  if (second && best.authority >= 90 && best.authority - second.authority >= 20) {
    return {
      type: "resolved",
      evidenceId: best.id,
      value: best.value,
      reason: `preferred_authority_${best.authority}_over_${second.authority}`,
    };
  }
  if (
    second &&
    best.observedAt > 0 &&
    second.observedAt > 0 &&
    best.observedAt - second.observedAt > 30 * 24 * 60 * 60 * 1000 &&
    best.authority >= second.authority
  ) {
    return {
      type: "resolved",
      evidenceId: best.id,
      value: best.value,
      reason: "preferred_newer_source",
    };
  }

  return {
    type: "conflicting",
    reason: `conflicting_values:${[...unique.keys()].slice(0, 3).join("|")}`,
    values: [...unique.keys()],
  };
}

/** @deprecated use resolveEvidenceConflict */
export function detectConflict(
  evidence: Evidence[],
  requestId: string,
): string | null {
  const r = resolveEvidenceConflict(evidence, requestId);
  if (r.type === "conflicting") return r.reason;
  return null;
}
