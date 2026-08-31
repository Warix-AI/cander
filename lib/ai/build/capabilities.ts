/**
 * Build capability gating — independent of activeSpace alone.
 */

import type {
  BuildCapabilityResolution,
  BuildTaskComplexity,
} from "./types.ts";

const CREATE_RE =
  /\b(build|create|make|scaffold|generate|spin\s*up)\b[\s\S]{0,48}\b(me\s+)?(a\s+|an\s+)?(website|web\s*site|site|landing\s*page|app|application|dashboard|saas|portfolio|blog|automation)\b/i;

const REFINE_RE =
  /\b(add|remove|replace|update|change|edit|fix|make|use|configure|publish|deploy)\b[\s\S]{0,64}\b(page|hero|pricing|nav|footer|auth|login|component|theme|style|color|darker|modern|section|route|plan|financing)\b/i;

const BUILD_DOMAIN_RE =
  /\b(hvac|landing\s*page|pricing\s*page|google\s+auth|authentication|sitemap|seo)\b/i;

const RESEARCH_IN_BUILD_RE =
  /\b(weather|news|stock|score|who\s+won|what('?s| is)\s+the\s+latest|search\s+(the\s+)?web|look\s*up\s+online)\b/i;

const GREETING_RE =
  /^(hi|hello|hey|thanks|thank\s+you|good\s+(morning|afternoon|evening))[\s!.]*$/i;

export function isBuildCreateIntent(text: string): boolean {
  return CREATE_RE.test(text.trim());
}

export function isBuildRefineIntent(text: string): boolean {
  const t = text.trim();
  return REFINE_RE.test(t) || BUILD_DOMAIN_RE.test(t);
}

export function isBuildIntent(text: string): boolean {
  return isBuildCreateIntent(text) || isBuildRefineIntent(text);
}

export function classifyBuildComplexity(text: string): BuildTaskComplexity {
  const t = text.trim();
  if (
    /\b(novel|custom\s+algorithm|from\s+scratch|large\s+refactor|architecture)\b/i.test(
      t,
    ) ||
    /\brepeated\s+(fix|repair|fail)/i.test(t)
  ) {
    return "complex";
  }
  if (
    /\b(auth|database|supabase|rls|multi[- ]?page|integration|oauth)\b/i.test(t) &&
    !/\b(hero|color|darker|pricing\s+page|text|copy|style)\b/i.test(t)
  ) {
    return "moderate";
  }
  if (
    /\b(hero|darker|modern|style|theme|color|pricing\s+page|add\s+a\s+page|remove\s+pricing|text|copy|content)\b/i.test(
      t,
    ) ||
    isBuildCreateIntent(t)
  ) {
    // Create from recipe is routine when recipe exists; novel create → moderate later.
    if (isBuildCreateIntent(t) && /\b(custom|novel|unique)\b/i.test(t)) {
      return "complex";
    }
    if (
      isBuildCreateIntent(t) &&
      /\b(auth|database|dashboard\s+with)\b/i.test(t)
    ) {
      return "moderate";
    }
    return "routine";
  }
  if (isBuildIntent(t)) return "moderate";
  return "routine";
}

export type ResolveBuildCapabilitiesInput = {
  content: string;
  /** Supporting signal only. */
  activeSpace?: string | null;
  /** Thread/request project association. */
  projectId?: string | null;
  /** Project kind from entity store when known. */
  projectKind?: string | null;
  /** Prior turn already in a build thread with validated spec. */
  hasBuildSpec?: boolean;
};

/**
 * Derive requiresBuildCapabilities after conversation resolution.
 * activeSpace === "build" alone is NOT enough.
 */
export function resolveBuildCapabilities(
  input: ResolveBuildCapabilitiesInput,
): BuildCapabilityResolution {
  const content = input.content.trim();
  const reasons: string[] = [];

  if (!content || GREETING_RE.test(content)) {
    return {
      requiresBuildCapabilities: false,
      complexity: "routine",
      reasons: ["greeting_or_empty"],
    };
  }

  if (RESEARCH_IN_BUILD_RE.test(content) && !isBuildIntent(content)) {
    return {
      requiresBuildCapabilities: false,
      complexity: "routine",
      reasons: ["research_or_live_info"],
    };
  }

  const intent = isBuildIntent(content);
  if (intent) {
    reasons.push("build_intent");
  }

  const projectImpliesBuild =
    Boolean(input.projectId) &&
    (input.projectKind === "app" ||
      input.projectKind === "site" ||
      input.projectKind === "automation" ||
      input.hasBuildSpec === true);

  const refineOnProject =
    projectImpliesBuild &&
    /\b(add|remove|change|update|edit|make|fix|use|publish|darker|modern|hero|pricing|page)\b/i.test(
      content,
    );

  if (refineOnProject) {
    reasons.push("project_refine");
  }

  // Space alone never unlocks Build for unrelated asks.
  if (input.activeSpace === "build" && intent) {
    reasons.push("build_space_with_intent");
  }

  const requires = intent || refineOnProject;
  if (!requires && input.activeSpace === "build") {
    reasons.push("build_space_without_build_intent");
  }

  return {
    requiresBuildCapabilities: requires,
    complexity: requires ? classifyBuildComplexity(content) : "routine",
    reasons,
  };
}
