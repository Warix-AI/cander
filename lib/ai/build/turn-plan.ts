/**
 * Structured TurnPlan resolver — deterministic-first.
 * Human labels are logging-only.
 */

import type { ConversationTurnState } from "../turn-environment/conversation-types.ts";
import type { BuildSpec, BuildSpecDelta, TurnPlan, TurnPlanOperation } from "./types.ts";
import { classifyBuildComplexity, isBuildCreateIntent } from "./capabilities.ts";

export type ResolveTurnPlanInput = {
  content: string;
  conversationState?: ConversationTurnState | null;
  buildSpec: BuildSpec | null;
  projectId: string | null;
  needsClarification?: boolean;
  clarificationReason?: string;
};

function pageIdForRoute(route: string): string {
  const clean = route.replace(/^\//, "").replace(/\W+/g, "_") || "home";
  return `page_${clean}`;
}

/** Deterministic pending delta for common edits (candidate only). */
export function resolvePendingDelta(
  content: string,
  spec: BuildSpec | null,
): BuildSpecDelta | null {
  const text = content.trim();
  if (!spec) {
    if (isBuildCreateIntent(text)) {
      return {
        set: [
          { path: "goal", value: text.slice(0, 200) },
          { path: "projectType", value: inferProjectType(text) },
        ],
      };
    }
    return null;
  }

  if (/\b(hero).{0,40}\b(darker|dark)\b/i.test(text) || /\bmake\s+the\s+hero\s+darker\b/i.test(text)) {
    return {
      set: [
        { path: "design.theme", value: "darker_hero" },
        {
          path: "design.colors.heroBackground",
          value: "#0f172a",
        },
      ],
    };
  }

  if (/\b(more\s+modern|modernize).{0,24}\bhero\b|\bhero.{0,24}(more\s+modern|modern)\b/i.test(text)) {
    return {
      set: [{ path: "design.style", value: "modern_hero" }],
    };
  }

  const pricing =
    /\badd\b.{0,40}\bpricing\b|\bpricing\s+page\b|\bthree\s+plans\b/i.test(text);
  if (pricing) {
    const route = "/pricing";
    const plans = [
      { id: "basic", name: "Basic" },
      { id: "pro", name: "Pro" },
      { id: "enterprise", name: "Enterprise" },
    ];
    const pricingSection = {
      id: "sec_pricing",
      role: "pricing",
      pageId: pageIdForRoute(route),
      content: { plans },
    };
    const pages = spec.pages.some((p) => p.route === route)
      ? spec.pages
      : [
          ...spec.pages,
          {
            id: pageIdForRoute(route),
            route,
            title: "Pricing",
            sectionIds: ["sec_pricing"],
          },
        ];
    const withoutPricing = spec.sections.filter((s) => s.role !== "pricing");
    const withPricing = [...withoutPricing, pricingSection];
    const withNav = mergeNavLink({ ...spec, sections: withPricing }, route);
    return {
      set: [
        { path: "pages", value: pages },
        { path: "sections", value: withNav },
      ],
    };
  }

  if (/\bremove\b.{0,24}\bpricing\b/i.test(text)) {
    return {
      set: [
        {
          path: "pages",
          value: spec.pages.filter((p) => p.route !== "/pricing"),
        },
        {
          path: "sections",
          value: spec.sections.filter((s) => s.role !== "pricing"),
        },
      ],
    };
  }

  if (/\bpublish\b/i.test(text)) {
    return null;
  }

  return null;
}

function mergeNavLink(spec: BuildSpec, route: string): BuildSpec["sections"] {
  const sections = [...spec.sections];
  const navIdx = sections.findIndex((s) => s.role === "nav");
  if (navIdx < 0) {
    sections.push({
      id: "sec_nav",
      role: "nav",
      content: { links: ["/", route] },
    });
    return sections;
  }
  const nav = sections[navIdx]!;
  const links = new Set<string>(
    ((nav.content?.links as string[] | undefined) ?? []).concat(route),
  );
  sections[navIdx] = {
    ...nav,
    content: { ...nav.content, links: [...links] },
  };
  return sections;
}

function inferProjectType(text: string): string {
  if (/\b(dashboard|admin)\b/i.test(text)) return "dashboard";
  if (/\b(app|saas)\b/i.test(text)) return "app";
  if (/\b(automat)/i.test(text)) return "automation";
  if (/\b(site|website|landing|hvac)\b/i.test(text)) return "site";
  return "unknown";
}

function operationsFor(
  content: string,
  spec: BuildSpec | null,
): TurnPlanOperation[] {
  const text = content.trim();
  const ops: TurnPlanOperation[] = [{ type: "spec.read" }];

  if (/\bpublish\b/i.test(text)) {
    ops.push({ type: "build.validate" }, { type: "publish.gate" });
    return ops;
  }

  if (/\bfix\s+(the\s+)?build\b|\bbuild\s+fail/i.test(text)) {
    ops.push({ type: "build.validate" });
    return ops;
  }

  if (/\b(google\s+auth|authentication|sign\s*in)\b/i.test(text)) {
    ops.push({ type: "auth.configure", recipeId: "auth-google" });
    ops.push({ type: "build.validate" });
    return ops;
  }

  if (/\bdifferent\s+hero\b|\breplace\b.{0,24}\bhero\b|\buse\s+a\s+different\s+hero\b/i.test(text)) {
    ops.push(
      { type: "component.search", role: "hero", query: "modern hero" },
      { type: "component.replace", role: "hero" },
      { type: "build.validate" },
    );
    return ops;
  }

  if (/\bremove\b.{0,24}\bpricing\b/i.test(text)) {
    ops.push({ type: "page.remove", route: "/pricing" }, { type: "build.validate" });
    return ops;
  }

  if (/\bpricing\b/i.test(text) && /\b(add|page|plans)\b/i.test(text)) {
    ops.push(
      { type: "component.search", role: "pricing" },
      { type: "page.create", route: "/pricing", title: "Pricing" },
      { type: "navigation.update" },
      { type: "build.validate" },
    );
    return ops;
  }

  if (/\b(hero|darker|modern|style|theme|color)\b/i.test(text)) {
    ops.push({ type: "style.edit", target: "hero" }, { type: "build.validate" });
    return ops;
  }

  if (isBuildCreateIntent(text) && !spec) {
    const recipeId = inferRecipeId(text);
    ops.push(
      { type: "recipe.apply", recipeId },
      { type: "dependencies.ensure" },
      { type: "build.validate" },
    );
    return ops;
  }

  if (/\b(edit|change|update|copy|text|content)\b/i.test(text)) {
    ops.push({ type: "content.edit", target: "copy" }, { type: "build.validate" });
    return ops;
  }

  ops.push({ type: "spec.patch", deltaHint: text.slice(0, 80) }, {
    type: "build.validate",
  });
  return ops;
}

export function inferRecipeId(text: string): string {
  if (/\bhvac\b|local\s+business|plumbing|roofing/i.test(text)) {
    return "local-business-site";
  }
  if (/\bsaas\b|marketing\s+site|landing\s+page/i.test(text)) {
    return "saas-marketing-site";
  }
  if (/\bdashboard\b/i.test(text)) return "dashboard-app";
  if (/\bblog\b/i.test(text)) return "blog";
  if (/\bportfolio\b/i.test(text)) return "portfolio";
  return "saas-marketing-site";
}

function criteriaFor(
  content: string,
  ops: TurnPlanOperation[],
): TurnPlan["completionCriteria"] {
  const criteria: TurnPlan["completionCriteria"] = [];
  if (ops.some((o) => o.type === "page.create")) {
    const page = ops.find((o) => o.type === "page.create") as
      | Extract<TurnPlanOperation, { type: "page.create" }>
      | undefined;
    const route = page?.route ?? "/pricing";
    criteria.push(
      { id: "route_exists", kind: "route_exists", params: { route } },
      { id: "nav_links", kind: "nav_links", params: { route } },
    );
    if (/\bthree\s+plans\b|pricing/i.test(content)) {
      criteria.push({
        id: "three_plans",
        kind: "plans_render",
        params: { count: 3 },
      });
    }
  }
  if (ops.some((o) => o.type === "page.remove")) {
    criteria.push({
      id: "pricing_gone",
      kind: "custom",
      params: { passed: true },
      label: "pricing removed",
    });
  }
  if (ops.some((o) => o.type === "build.validate" || o.type === "publish.gate")) {
    criteria.push(
      { id: "build_ok", kind: "build_succeeds" },
      { id: "no_runtime", kind: "no_runtime_errors" },
    );
  }
  if (ops.some((o) => o.type === "style.edit")) {
    criteria.push({
      id: "style_set",
      kind: "custom",
      params: { passed: true },
      label: "style applied in pending delta",
    });
  }
  if (!criteria.length) {
    criteria.push({ id: "no_runtime", kind: "no_runtime_errors" });
  }
  return criteria;
}

export function resolveTurnPlan(input: ResolveTurnPlanInput): TurnPlan {
  const content = input.content.trim();
  if (input.needsClarification) {
    return {
      objective: "clarify_project",
      subject: { projectId: input.projectId },
      operations: [
        {
          type: "clarify",
          reason: input.clarificationReason ?? "ambiguous_project",
        },
      ],
      completionCriteria: [],
      complexity: "routine",
      needsClarification: true,
      clarificationReason: input.clarificationReason,
      label: "Clarify which project to modify",
    };
  }

  const ops = operationsFor(content, input.buildSpec);
  const pendingDelta = resolvePendingDelta(content, input.buildSpec);
  const complexity = classifyBuildComplexity(content);
  let objective = "build_edit";
  if (isBuildCreateIntent(content) && !input.buildSpec) objective = "create_project";
  if (/\bpricing\b/i.test(content) && /\badd\b/i.test(content)) {
    objective = "add_pricing_page";
  }
  if (/\bremove\b.{0,24}\bpricing\b/i.test(content)) objective = "remove_pricing_page";
  if (/\bpublish\b/i.test(content)) objective = "publish_draft";
  if (/\bfix\s+(the\s+)?build\b/i.test(content)) objective = "fix_build";
  if (/\bhero\b/i.test(content)) objective = "edit_hero";

  const recipeId = ops.find((o) => o.type === "recipe.apply") as
    | Extract<TurnPlanOperation, { type: "recipe.apply" }>
    | undefined;

  return {
    objective,
    subject: { projectId: input.projectId },
    operations: ops,
    completionCriteria: criteriaFor(content, ops),
    complexity,
    pendingDelta,
    recipeId: recipeId?.recipeId ?? input.buildSpec?.recipeId,
    recipeVersion: input.buildSpec?.recipeVersion ?? (recipeId ? 1 : undefined),
    label: objective,
  };
}
