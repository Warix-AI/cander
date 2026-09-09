/**
 * Role-based 21st research from BuildPlan (plan-first).
 * Server-oriented; browser calls via /api/ai/twenty-first.
 */

import type { RetrievedComponentRef } from "@/lib/ai/build/website-setup-brief";
import type {
  BuildPlanJson,
  ResearchManifest,
  ResearchRoleEntry,
} from "@/lib/ai/build/plan/types";
import {
  createTwentyFirstMcpClient,
  setActiveTwentyFirstClient,
  type SiteSpecRetrievalResult,
  type TwentyFirstMcpClient,
} from "@/lib/ai/build/twenty-first-mcp";
import { BUILD_RETRY_BUDGETS } from "@/lib/ai/build/retry-budgets";
import {
  buildRoleQueries,
  pickTopCandidates,
  scoreResearchCandidate,
} from "@/lib/ai/build/research/score";

export type BuildPlanRetrievalResult = SiteSpecRetrievalResult & {
  researchManifest: ResearchManifest;
};

export async function retrieveComponentsForBuildPlan(
  plan: BuildPlanJson,
  client?: TwentyFirstMcpClient | null,
): Promise<BuildPlanRetrievalResult> {
  const mcp =
    client === undefined ? await createTwentyFirstMcpClient() : client;

  const emptyManifest = (): ResearchManifest => ({
    version: 1,
    roles: [],
    packageDependencies: {},
    updatedAt: new Date().toISOString(),
  });

  if (!mcp) {
    const roles: ResearchRoleEntry[] = plan.componentNeeds.map((need) => ({
      role: need.role,
      designIntent: need.designIntent,
      queries: buildRoleQueries(need),
      candidates: [],
      selected: null,
      rejected: [],
      fallback: "catalog",
      deps: [],
      primitives: [],
      assets: [],
      config: [],
    }));
    return {
      components: [],
      usedFallback: true,
      connected: false,
      toolsDiscovered: [],
      error: "21st MCP not configured or connect failed",
      researchManifest: {
        version: 1,
        roles,
        packageDependencies: {},
        updatedAt: new Date().toISOString(),
      },
    };
  }

  setActiveTwentyFirstClient(mcp);
  const out: RetrievedComponentRef[] = [];
  const seen = new Set<string>();
  const roles: ResearchRoleEntry[] = [];
  const packageDependencies: Record<string, string> = {};

  for (const need of plan.componentNeeds) {
    const queries = buildRoleQueries(need);
    const scoredRows: Array<
      ReturnType<typeof scoreResearchCandidate> & {
        id: string;
        name?: string;
        source?: "twenty_first";
        deps?: string[];
      }
    > = [];

    let round = 0;
    for (const query of queries) {
      if (round >= BUILD_RETRY_BUDGETS.researchRoundsPerRole) break;
      round += 1;
      try {
        const hits = await mcp.search({
          query,
          role: need.role,
          limit: BUILD_RETRY_BUDGETS.researchTopK,
        });
        for (const hit of hits) {
          if (seen.has(hit.id) && scoredRows.some((r) => r.id === hit.id)) {
            continue;
          }
          const scored = scoreResearchCandidate({
            need,
            id: hit.id,
            name: hit.name,
            category: hit.category,
            deps: hit.dependencies,
            snippetPreview: hit.codeSnippet?.slice(0, 400),
          });
          scoredRows.push({
            ...scored,
            id: hit.id,
            name: hit.name,
            source: "twenty_first",
            deps: hit.dependencies,
          });
        }
      } catch (err) {
        console.warn("[cander:research] search failed", need.role, err);
      }
    }

    const picked = pickTopCandidates(
      scoredRows.map((r) => ({
        id: r.id,
        name: r.name,
        score: r.score,
        reasons: r.reasons,
        source: r.source,
        deps: r.deps,
        rejectReason: r.rejectReason,
      })),
    );

    let selectedFull: RetrievedComponentRef | null = null;
    let fallback: ResearchRoleEntry["fallback"] = "none";

    if (picked.selected) {
      try {
        const got = await mcp.getComponent(picked.selected.id);
        selectedFull = got
          ? {
              ...got,
              category: need.role,
              name: got.name || picked.selected.name || picked.selected.id,
            }
          : {
              id: picked.selected.id,
              name: picked.selected.name || picked.selected.id,
              category: need.role,
              source: "twenty_first",
            };
      } catch {
        selectedFull = {
          id: picked.selected.id,
          name: picked.selected.name || picked.selected.id,
          category: need.role,
          source: "twenty_first",
        };
      }
      if (selectedFull && !seen.has(selectedFull.id)) {
        seen.add(selectedFull.id);
        out.push(selectedFull);
        for (const dep of selectedFull.dependencies ?? []) {
          packageDependencies[dep] = packageDependencies[dep] || "latest";
        }
      }
    } else {
      fallback = "catalog";
    }

    roles.push({
      role: need.role,
      designIntent: need.designIntent,
      queries,
      candidates: picked.candidates,
      selected: picked.selected,
      rejected: picked.rejected,
      fallback,
      deps: selectedFull?.dependencies ?? [],
      primitives: [],
      assets: [],
      config: [],
    });
  }

  const withCode = out.filter((c) => c.codeSnippet?.trim());
  return {
    components: out,
    usedFallback: out.length === 0 || withCode.length === 0,
    connected: mcp.isConnected,
    toolsDiscovered: mcp.discoveredTools,
    researchManifest: {
      version: 1,
      roles,
      packageDependencies,
      updatedAt: new Date().toISOString(),
    },
  };
}
