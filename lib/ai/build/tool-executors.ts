/**
 * Build tool executors — semantic tools wrap store / recipes / components.
 * Low-level computer.* tools remain stubs here when no live session
 * (ComputerProvider is invoked via /api/computer when sandbox is enabled).
 */

import type { AiToolCallResult } from "../runtime/tools.ts";
import { compileBuildSpecSlice } from "./build-spec.ts";
import { loadBuildSpec } from "./store.ts";
import { searchComponentsBounded } from "./component-provider.ts";
import { getBuildRecipe } from "./recipes.ts";
import { getTurnProjectId } from "../runtime/turn-context.ts";

export async function executeBuildTool(opts: {
  name: string;
  args: Record<string, unknown>;
}): Promise<AiToolCallResult | null> {
  const { name, args } = opts;
  if (
    !name.startsWith("build.") &&
    !name.startsWith("computer.files") &&
    name !== "computer.exec" &&
    name !== "computer.port.expose"
  ) {
    return null;
  }

  const projectId =
    String(args.projectId ?? getTurnProjectId() ?? "").trim() || null;

  if (name === "build.spec.read") {
    if (!projectId) {
      return { name, ok: false, output: "projectId required" };
    }
    const spec = loadBuildSpec(projectId);
    if (!spec) {
      return { name, ok: false, output: "no BuildSpec for project" };
    }
    return {
      name,
      ok: true,
      output: compileBuildSpecSlice(spec),
      data: { version: spec.buildSpecVersion },
    };
  }

  if (name === "build.component.search") {
    const query = String(args.query ?? args.role ?? "").trim();
    const candidates = await searchComponentsBounded({
      query,
      role: args.role ? String(args.role) : undefined,
    });
    return {
      name,
      ok: true,
      output: JSON.stringify(candidates),
      data: { candidates },
    };
  }

  if (name === "build.recipe.apply") {
    const recipeId = String(args.recipeId ?? "");
    const recipe = getBuildRecipe(recipeId);
    if (!recipe) {
      return { name, ok: false, output: `unknown recipe: ${recipeId}` };
    }
    return {
      name,
      ok: true,
      output: `recipe ${recipe.recipeId}@${recipe.recipeVersion} ready`,
      data: { recipe },
    };
  }

  if (name === "build.validate") {
    return {
      name,
      ok: true,
      output: "validation queued — runtime owns completion criteria",
    };
  }

  if (name === "build.publish") {
    return {
      name,
      ok: true,
      output:
        "Publish requires Validated Draft + user confirmation. Use request_publish_approval.",
      pauseForUser: true,
    };
  }

  if (
    name.startsWith("computer.files") ||
    name === "computer.exec" ||
    name === "computer.port.expose"
  ) {
    return {
      name,
      ok: false,
      output:
        "Sandbox session required. Low-level computer tools run only with an active project session.",
    };
  }

  return {
    name,
    ok: true,
    output: `${name} acknowledged — applied via Build TurnPlan runtime when gated`,
    data: args,
  };
}
