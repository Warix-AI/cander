/**
 * Gated Build turn context — call only when Build orchestrator flag is on.
 * Read-only in P0B: resolve capabilities, project, load/slice spec, TurnPlan.
 * No sandbox mutation here.
 */

import {
  isBuildLocalOrchestratorEnabled,
  isBuildOrchestratorEnabled,
} from "../orchestrator/flags.ts";
import type { ConversationTurnState } from "../turn-environment/conversation-types.ts";
import {
  compileBuildSpecSlice,
  emptyBuildSpec,
  loadBuildSpec,
  resolveBuildCapabilities,
  resolveBuildProject,
  resolveTurnPlan,
  type BuildSpec,
  type BuildTaskComplexity,
  type ProjectCandidate,
  type ProjectResolveResult,
  type TurnPlan,
} from "./index.ts";
import {
  buildTurnLogFromParts,
  logBuildTurn,
} from "./observability.ts";

export type BuildTurnContext = {
  enabled: boolean;
  requiresBuildCapabilities: boolean;
  complexity: BuildTaskComplexity;
  projectResolve: ProjectResolveResult;
  projectId: string | null;
  buildSpec: BuildSpec | null;
  buildSpecSlice: string | null;
  turnPlan: TurnPlan | null;
  /** Force domains for capability compiler when Build is active. */
  forceDomains: string[];
};

export type ResolveBuildTurnContextInput = {
  content: string;
  activeSpace?: string | null;
  explicitProjectId?: string | null;
  threadProjectId?: string | null;
  projectKind?: string | null;
  conversationState?: ConversationTurnState | null;
  candidates?: ProjectCandidate[];
  /** Override flag for tests. */
  forceEnabled?: boolean;
};

export function resolveBuildTurnContext(
  input: ResolveBuildTurnContextInput,
): BuildTurnContext {
  const empty: BuildTurnContext = {
    enabled: false,
    requiresBuildCapabilities: false,
    complexity: "routine",
    projectResolve: {
      status: "none",
      projectId: null,
      reason: "build_disabled",
    },
    projectId: null,
    buildSpec: null,
    buildSpecSlice: null,
    turnPlan: null,
    forceDomains: [],
  };

  const enabled =
    input.forceEnabled === true || isBuildOrchestratorEnabled();
  if (!enabled) return empty;

  const caps = resolveBuildCapabilities({
    content: input.content,
    activeSpace: input.activeSpace,
    projectId: input.explicitProjectId ?? input.threadProjectId,
    projectKind: input.projectKind,
    hasBuildSpec: Boolean(
      (input.explicitProjectId || input.threadProjectId) &&
        loadBuildSpec(
          String(input.explicitProjectId ?? input.threadProjectId),
        ),
    ),
  });

  if (!caps.requiresBuildCapabilities) {
    logBuildTurn(
      buildTurnLogFromParts({
        content: input.content,
        projectId: null,
        requiresBuildCapabilities: false,
        before: null,
        after: null,
        delta: null,
        plan: null,
        observations: null,
        validation: null,
        finalResult: "skipped",
      }),
    );
    return {
      ...empty,
      enabled: true,
      requiresBuildCapabilities: false,
      complexity: caps.complexity,
      projectResolve: {
        status: "none",
        projectId: null,
        reason: caps.reasons.join(",") || "not_build",
      },
    };
  }

  const projectResolve = resolveBuildProject({
    content: input.content,
    explicitProjectId: input.explicitProjectId,
    threadProjectId: input.threadProjectId,
    conversationState: input.conversationState,
    candidates: input.candidates,
  });

  let projectId = projectResolve.projectId;
  let buildSpec: BuildSpec | null = null;
  let planningSpec: BuildSpec | null = null;

  if (projectResolve.status === "create") {
    // Ephemeral id for planning; store commit happens on mutation.
    projectId = projectId ?? `pending_${hashShort(input.content)}`;
    planningSpec = emptyBuildSpec({
      projectId,
      goal: input.content.slice(0, 200),
      projectType: "site",
    });
    // Pass null into TurnPlan so create/recipe ops are selected.
    buildSpec = null;
  } else if (projectId) {
    buildSpec = loadBuildSpec(projectId);
    planningSpec = buildSpec;
  }

  const turnPlan = resolveTurnPlan({
    content: input.content,
    conversationState: input.conversationState,
    buildSpec,
    projectId,
    needsClarification: projectResolve.status === "clarify",
    clarificationReason: projectResolve.reason,
  });

  const sliceSource = planningSpec;
  const buildSpecSlice = sliceSource
    ? compileBuildSpecSlice(sliceSource, {
        focusRoutes: turnPlan.operations
          .filter((o): o is Extract<typeof o, { type: "page.create" }> =>
            o.type === "page.create",
          )
          .map((o) => o.route),
      })
    : null;

  logBuildTurn(
    buildTurnLogFromParts({
      content: input.content,
      projectId,
      requiresBuildCapabilities: true,
      before: planningSpec,
      after: planningSpec,
      delta: turnPlan.pendingDelta ?? null,
      plan: turnPlan,
      observations: null,
      validation: null,
      finalResult:
        projectResolve.status === "clarify" ? "clarify" : "skipped",
    }),
  );

  return {
    enabled: true,
    requiresBuildCapabilities: true,
    complexity: caps.complexity,
    projectResolve,
    projectId,
    buildSpec: planningSpec,
    buildSpecSlice,
    turnPlan,
    forceDomains: ["build", "projects"],
  };
}

function hashShort(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 8);
}

/** Whether this Build turn may run on local FM + sandbox (flagged). */
export function shouldRunBuildLocally(ctx: BuildTurnContext): boolean {
  if (!ctx.enabled || !ctx.requiresBuildCapabilities) return false;
  if (!isBuildLocalOrchestratorEnabled()) return false;
  return ctx.complexity === "routine";
}
