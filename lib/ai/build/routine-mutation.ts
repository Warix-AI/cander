/**
 * P0C routine Build mutations — Working Attempt → validate → commit.
 * Failed attempts never overwrite Validated Draft.
 */

import {
  applyRecipeToSpecFields,
  canApplyRecipe,
  getBuildRecipe,
  validateBackendRecipeSecurity,
} from "./recipes.ts";
import { searchComponentsBounded } from "./component-provider.ts";
import {
  buildTurnLogFromParts,
  logBuildTurn,
} from "./observability.ts";
import {
  emptyObservations,
  finalizeBuildAttempt,
  observationsWithFailedBuild,
  observationsWithSuccessfulBuild,
} from "./attempt.ts";
import {
  ensureBuildSpec,
  loadBuildSpec,
  upsertSandboxSessionRef,
} from "./store.ts";
import type { BuildSpecDelta, TurnPlan } from "./types.ts";
import type { BuildTurnContext } from "./turn-context.ts";

export type RunRoutineBuildMutationResult = {
  ok: boolean;
  content: string;
  claimedSuccess: boolean;
  projectId: string | null;
};

/**
 * Execute a routine TurnPlan against the in-memory Draft path.
 * Uses simulated successful sandbox validation unless opts.failValidation.
 */
export async function runRoutineBuildMutation(opts: {
  content: string;
  ctx: BuildTurnContext;
  failValidation?: boolean;
}): Promise<RunRoutineBuildMutationResult> {
  const { ctx } = opts;
  if (!ctx.requiresBuildCapabilities || !ctx.turnPlan) {
    return {
      ok: false,
      content: "",
      claimedSuccess: false,
      projectId: null,
    };
  }

  if (ctx.projectResolve.status === "clarify") {
    const names =
      ctx.projectResolve.candidates?.map((c) => c.title).join(", ") ??
      "your projects";
    return {
      ok: true,
      content: `Which project should I update? I found multiple matches (${names}).`,
      claimedSuccess: false,
      projectId: null,
    };
  }

  let projectId = ctx.projectId;
  if (!projectId) {
    return {
      ok: false,
      content: "I need a project before I can make Build changes.",
      claimedSuccess: false,
      projectId: null,
    };
  }

  // Materialize create into store on first mutation.
  let spec = loadBuildSpec(projectId);
  if (!spec) {
    spec = ensureBuildSpec({
      projectId,
      goal: opts.content.slice(0, 200),
      projectType: "site",
    });
  }

  const plan = ctx.turnPlan;
  let delta: BuildSpecDelta | null = plan.pendingDelta ?? null;

  // Recipe apply
  const recipeOp = plan.operations.find((o) => o.type === "recipe.apply");
  if (recipeOp && recipeOp.type === "recipe.apply") {
    const recipe = getBuildRecipe(recipeOp.recipeId);
    if (recipe) {
      const gate = canApplyRecipe(spec, recipe);
      if (!gate.ok) {
        return {
          ok: false,
          content: `This project is pinned to ${spec.recipeId}@${spec.recipeVersion}. I will not silently upgrade the recipe.`,
          claimedSuccess: false,
          projectId,
        };
      }
      const fields = applyRecipeToSpecFields(recipe);
      delta = {
        set: [
          { path: "goal", value: spec.goal || opts.content.slice(0, 200) },
          { path: "projectType", value: fields.projectType },
          { path: "pages", value: fields.pages },
          { path: "sections", value: fields.sections },
          { path: "dependencies", value: fields.dependencies },
          { path: "recipeId", value: fields.recipeId },
          { path: "recipeVersion", value: fields.recipeVersion },
          ...(fields.seo
            ? [{ path: "seo", value: fields.seo } as const]
            : []),
        ],
      };
    }
  }

  // Auth recipe
  const authOp = plan.operations.find((o) => o.type === "auth.configure");
  if (authOp && authOp.type === "auth.configure") {
    const recipeId = authOp.recipeId ?? "auth";
    const security = validateBackendRecipeSecurity(recipeId, {
      auth_enabled: true,
      google_provider_configured: recipeId === "auth-google",
      no_service_role_in_client: true,
      session_cookie_http_only: true,
      rls_enabled: true,
      policies_exist: true,
      anon_matches_intent: true,
      profiles_select_own: true,
      profiles_update_own: true,
    });
    if (!security.ok) {
      return {
        ok: false,
        content: `Auth recipe failed security checks: ${security.missing.join(", ")}.`,
        claimedSuccess: false,
        projectId,
      };
    }
    delta = {
      set: [
        {
          path: "auth",
          value: {
            recipeId,
            recipeVersion: 1,
            providers: recipeId === "auth-google" ? ["google"] : ["email"],
            configured: true,
          },
        },
      ],
    };
  }

  // Component search/replace — record selection in delta only
  if (plan.operations.some((o) => o.type === "component.search")) {
    const searchOp = plan.operations.find((o) => o.type === "component.search");
    if (searchOp && searchOp.type === "component.search") {
      const candidates = await searchComponentsBounded({
        query: searchOp.query ?? searchOp.role,
        role: searchOp.role,
      });
      const chosen = candidates[0];
      if (chosen) {
        const rest = (spec.components ?? []).filter(
          (c) => c.role !== searchOp.role,
        );
        delta = {
          ...(delta ?? {}),
          set: [
            ...((delta?.set as Array<{ path: string; value: unknown }>) ?? []),
            {
              path: "components",
              value: [
                ...rest,
                {
                  id: chosen.id,
                  role: searchOp.role,
                  source: chosen.source,
                  name: chosen.name,
                },
              ],
            },
            ...(searchOp.role === "hero"
              ? [{ path: "design.style", value: "replaced_hero" }]
              : []),
          ],
        };
      }
    }
  }

  upsertSandboxSessionRef(projectId, {
    status: "active",
    sessionId: `sim_${projectId}`,
    lastUsedAt: new Date().toISOString(),
    specVersion: spec.buildSpecVersion,
  });

  const observations = opts.failValidation
    ? observationsWithFailedBuild(projectId)
    : observationsWithSuccessfulBuild(projectId, {
        toolsSelected: plan.operations.map((o) => o.type),
        toolsExecuted: ["build.validate"],
        filesChanged: [{ path: "src/App.tsx", op: "patch" }],
      });

  // Publish gate: never claim success without validation
  if (plan.objective === "publish_draft") {
    const { validateBuildCompletion, mayClaimBuildSuccess } = await import(
      "./completion.ts"
    );
    const validation = validateBuildCompletion(plan, observations, spec);
    const ok = mayClaimBuildSuccess(validation) && !opts.failValidation;
    logBuildTurn(
      buildTurnLogFromParts({
        content: opts.content,
        projectId,
        requiresBuildCapabilities: true,
        before: spec,
        after: loadBuildSpec(projectId),
        delta: null,
        plan,
        observations,
        validation,
        finalResult: ok ? "success" : "failed",
      }),
    );
    return {
      ok,
      content: ok
        ? "Draft validated and ready to publish. Confirm in Publish when you want it live."
        : "I could not publish — validation did not pass. The live version is unchanged.",
      claimedSuccess: ok,
      projectId,
    };
  }

  if (!delta) {
    return {
      ok: true,
      content: "I understood the Build request but had no concrete delta to apply.",
      claimedSuccess: false,
      projectId,
    };
  }

  const result = finalizeBuildAttempt({
    projectId,
    plan,
    delta,
    observations,
  });

  logBuildTurn(
    buildTurnLogFromParts({
      content: opts.content,
      projectId,
      requiresBuildCapabilities: true,
      before: result.before,
      after: result.ok ? result.after : result.before,
      delta,
      plan,
      observations,
      validation: result.validation,
      finalResult: result.ok ? "success" : "failed",
    }),
  );

  if (!result.ok) {
    return {
      ok: false,
      content:
        "That update did not pass validation. Your previous Draft is unchanged.",
      claimedSuccess: false,
      projectId,
    };
  }

  return {
    ok: true,
    content: summarizeSuccess(plan, result.after.buildSpecVersion),
    claimedSuccess: true,
    projectId,
  };
}

function summarizeSuccess(plan: TurnPlan, version: number): string {
  switch (plan.objective) {
    case "create_project":
      return `Created the Draft from the ${plan.recipeId ?? "selected"} recipe (BuildSpec v${version}).`;
    case "add_pricing_page":
      return `Added a pricing page with three plans and updated navigation (BuildSpec v${version}).`;
    case "remove_pricing_page":
      return `Removed the pricing page (BuildSpec v${version}).`;
    case "edit_hero":
      return `Updated the hero (BuildSpec v${version}).`;
    case "fix_build":
      return `Build validation passed (BuildSpec v${version}).`;
    default:
      return `Updated the Draft (BuildSpec v${version}).`;
  }
}

export function emptyBuildObservationsForPlan(
  projectId: string,
  plan: TurnPlan,
) {
  return emptyObservations({ projectId });
}
