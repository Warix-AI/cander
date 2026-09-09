/**
 * Score 21st candidates for a BuildPlan component need.
 * Rejects semantic mismatch (business nouns) and incompatible dependency hints.
 */

import type {
  BuildPlanComponentNeed,
  ResearchCandidate,
} from "../plan/types.ts";
import { BUILD_RETRY_BUDGETS } from "../retry-budgets.ts";

const BANNED_SOLO_TOKENS = new Set([
  "tree",
  "trees",
  "canopy",
  "lawn",
  "dental",
  "dentist",
  "pizza",
  "plumber",
  "roofing",
]);

/** Packages that usually indicate wrong vertical (data tree UI, etc.). */
const INCOMPATIBLE_DEP_PATTERNS = [
  /@headless-tree/i,
  /react-arborist/i,
  /@tanstack\/react-table/i,
];

export function buildRoleQueries(need: BuildPlanComponentNeed): string[] {
  const role = need.role.trim().toLowerCase();
  const intent = need.designIntent.trim();
  // Never search with business nouns alone — role + design intent only.
  const base = [
    `${role} section react ${intent}`.trim(),
    `marketing website ${role} ${intent}`.trim(),
    `${role} ui component react`.trim(),
  ];
  return [...new Set(base.map((q) => q.replace(/\s+/g, " ").trim()))].slice(
    0,
    BUILD_RETRY_BUDGETS.researchRoundsPerRole,
  );
}

export function scoreResearchCandidate(opts: {
  need: BuildPlanComponentNeed;
  id: string;
  name?: string;
  category?: string;
  deps?: string[];
  snippetPreview?: string;
}): { score: number; reasons: string[]; rejectReason?: string } {
  const role = opts.need.role.toLowerCase();
  const intent = opts.need.designIntent.toLowerCase();
  const name = (opts.name || "").toLowerCase();
  const category = (opts.category || "").toLowerCase();
  const blob = `${name} ${category} ${opts.snippetPreview || ""}`.toLowerCase();
  const reasons: string[] = [];
  let score = 0.35;

  if (category.includes(role) || name.includes(role)) {
    score += 0.35;
    reasons.push("role match");
  }
  for (const token of intent.split(/[^a-z0-9]+/).filter((t) => t.length > 3)) {
    if (BANNED_SOLO_TOKENS.has(token)) continue;
    if (blob.includes(token)) {
      score += 0.05;
      reasons.push(`intent:${token}`);
    }
  }

  const deps = opts.deps ?? [];
  for (const dep of deps) {
    if (INCOMPATIBLE_DEP_PATTERNS.some((re) => re.test(dep))) {
      return {
        score: 0,
        reasons,
        rejectReason: `incompatible dependency ${dep}`,
      };
    }
  }

  // Headless tree / data-tree false positives for landscaping "tree".
  if (
    /\b(headless.?tree|file.?tree|tree.?view|arborist)\b/i.test(blob) &&
    role !== "nav"
  ) {
    return {
      score: 0,
      reasons,
      rejectReason: "semantic mismatch (data-tree UI vs marketing section)",
    };
  }

  if (score < 0.4 && !reasons.includes("role match")) {
    return {
      score,
      reasons,
      rejectReason: "weak role/intent match",
    };
  }

  return {
    score: Math.min(1, score),
    reasons: reasons.length ? reasons : ["baseline"],
  };
}

export function pickTopCandidates(
  scored: Array<ResearchCandidate & { rejectReason?: string }>,
  topK = BUILD_RETRY_BUDGETS.researchTopK,
): {
  candidates: ResearchCandidate[];
  rejected: Array<{ id: string; reason: string }>;
  selected: ResearchCandidate | null;
} {
  const rejected: Array<{ id: string; reason: string }> = [];
  const ok: ResearchCandidate[] = [];
  for (const row of scored) {
    if (row.rejectReason) {
      rejected.push({ id: row.id, reason: row.rejectReason });
      continue;
    }
    ok.push({
      id: row.id,
      name: row.name,
      score: row.score,
      reasons: row.reasons,
      source: row.source,
      deps: row.deps,
    });
  }
  ok.sort((a, b) => b.score - a.score);
  const candidates = ok.slice(0, topK);
  return {
    candidates,
    rejected,
    selected: candidates[0] ?? null,
  };
}
