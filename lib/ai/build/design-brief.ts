/**
 * Canonical design brief — authoritative design direction for website builds.
 * Raw onboarding answers are preferences/requirements; the planner produces this brief.
 * Stored on project_spec.designBrief (and mirrored in plan JSON).
 */

import { AI_CHOICE_VALUE } from "@/lib/ai/clarification/ai-choice";
import {
  STYLE_DIRECTIONS,
  choiceLabel,
  describePalette,
  imageryStrategyFromAnswer,
  isAiChoice,
  normalizeSetupAnswersToShort,
  paletteTokens,
  urlsFromAnswer,
  type ImageryStrategy,
} from "@/lib/ai/build/website-setup-steps";

export type DesignConstraintStrength = "hard" | "preference" | "freedom";

export type DesignTokensBrief = {
  background?: string;
  foreground?: string;
  primary?: string;
  accent?: string;
  muted?: string;
  headingFontDirection?: string;
  bodyFontDirection?: string;
  radius?: string;
  spacing?: string;
  containerWidth?: string;
  borderStyle?: string;
  shadowStyle?: string;
};

export type ImageryPlanItem = {
  role: string;
  strategy: "generated" | "placeholder" | "user_upload" | "none";
  description: string;
  /** Stable path once written, e.g. /assets/hero.webp */
  assetPath?: string;
};

export type SelectedTwentyFirstComponent = {
  source: "21st";
  componentId: string;
  purpose: string;
  reason: string;
  adaptationInstructions: string;
  name?: string;
  writtenPath?: string;
  imported?: boolean;
  usedInRender?: boolean;
};

export type TwentyFirstUsageStats = {
  searchCount: number;
  fetchCount: number;
  selectedIds: string[];
  componentFilesWritten: string[];
  componentFilesImported: string[];
  componentFilesUsedInRender: string[];
  ignoredByCoder?: boolean;
};

export type CanonicalDesignBrief = {
  purpose: string;
  audience: string;
  primaryGoal: string;
  contentDirection: string;
  styleDirection: string;
  colorDirection: string;
  imageryStrategy: ImageryStrategy | string;
  referenceUrl: string | null;
  designTokens: DesignTokensBrief;
  imagery: ImageryPlanItem[];
  selectedComponents?: SelectedTwentyFirstComponent[];
  twentyFirstStats?: TwentyFirstUsageStats;
  avoid: string[];
  builderFreedom: string[];
  /** Hard vs preference tagging for key fields. */
  strengths?: {
    colors?: DesignConstraintStrength;
    style?: DesignConstraintStrength;
    imagery?: DesignConstraintStrength;
    darkMode?: DesignConstraintStrength;
  };
  referenceTraits?: string[];
  updatedAt?: string;
};

const GENERIC_AVOID = [
  "Purple SaaS gradients",
  "Glassmorphism everywhere",
  "Endless rounded cards",
  "Everything centered by default",
  "Dozens of pills and badges",
  "Fake testimonials",
  "Meaningless charts",
  "Decorative icons in every section",
  "Generic three-feature SaaS layout",
  "Template collage from unrelated 21st components",
];

function strengthForStyle(v: unknown): DesignConstraintStrength {
  if (isAiChoice(v) || v == null || v === "") return "freedom";
  return "preference";
}

function strengthForColors(v: unknown): DesignConstraintStrength {
  if (isAiChoice(v) || v == null || v === "" || v === "ai") return "freedom";
  if (typeof v === "object" && v) {
    const p = v as { custom?: string; primary?: string; accent?: string; mode?: string };
    if (p.custom?.trim() || p.primary || p.accent) return "hard";
    if (p.mode === "light" || p.mode === "dark") return "hard";
  }
  if (typeof v === "string" && (v === "light" || v === "dark")) return "hard";
  if (typeof v === "string" && /#[0-9a-f]{3,8}/i.test(v)) return "hard";
  return "preference";
}

function styleLabel(v: unknown): string {
  if (isAiChoice(v) || !v) return "Let Candor decide — choose what fits the business";
  if (typeof v === "string") {
    return choiceLabel(STYLE_DIRECTIONS, v) ?? v;
  }
  return String(v);
}

function colorLabel(v: unknown): string {
  if (isAiChoice(v) || v === "ai") return "Let Candor decide";
  if (typeof v === "string") {
    if (v === "light") return "Light mode";
    if (v === "dark") return "Dark mode";
    return v;
  }
  return describePalette(v) ?? "Let Candor decide";
}

function tokensFromColors(v: unknown): DesignTokensBrief {
  const tokens = paletteTokens(v);
  if (!tokens) return {};
  const out: DesignTokensBrief = {};
  if (tokens.background) out.background = tokens.background;
  if (tokens.foreground) out.foreground = tokens.foreground;
  if (tokens.primary) out.primary = tokens.primary;
  if (tokens.accent) out.accent = tokens.accent;
  if (tokens.custom) {
    // Leave concrete hex resolution to the planner when only free text was given.
    out.primary = out.primary || tokens.custom;
  }
  return out;
}

function defaultImageryPlan(
  strategy: ImageryStrategy,
  purpose: string,
): ImageryPlanItem[] {
  if (strategy === "minimal") {
    return [{ role: "hero", strategy: "none", description: "Typography-led hero; no photography" }];
  }
  const strat =
    strategy === "generate"
      ? "generated"
      : strategy === "user_upload"
        ? "user_upload"
        : strategy === "placeholder"
          ? "placeholder"
          : "generated";
  const subject = purpose.slice(0, 80) || "the business";
  return [
    {
      role: "hero",
      strategy: strat,
      description: `Primary hero visual that fits ${subject}`,
      assetPath: "/assets/hero.webp",
    },
    {
      role: "supporting",
      strategy: strat === "generated" ? "placeholder" : strat,
      description: `Supporting section image for ${subject}`,
      assetPath: "/assets/about.webp",
    },
  ];
}

/**
 * Derive a starter canonical brief from raw onboarding (before LLM planner enrichment).
 * Distinguishes hard requirements, preferences, and AI freedom.
 */
export function designBriefFromSetupAnswers(
  rawAnswers: Record<string, unknown>,
  opts?: { projectName?: string },
): CanonicalDesignBrief {
  const a = normalizeSetupAnswersToShort(rawAnswers);
  const purpose =
    (typeof a.purpose === "string" && a.purpose.trim()) ||
    opts?.projectName ||
    "Marketing website";
  const goal =
    (typeof a.goal === "string" && a.goal.trim()) ||
    "Communicate credibility and drive the primary conversion.";
  const imagery = imageryStrategyFromAnswer(a.imagery);
  const refs = urlsFromAnswer(a.reference_url ?? a.inspiration_urls);
  const styleStr = strengthForStyle(a.style);
  const colorStr = strengthForColors(a.colors);
  const freedom: string[] = [];
  if (styleStr === "freedom") freedom.push("styleDirection");
  if (colorStr === "freedom") freedom.push("colorDirection");
  if (imagery === "ai_choice") freedom.push("imageryStrategy");

  return {
    purpose: purpose.slice(0, 400),
    audience: extractAudience(goal),
    primaryGoal: goal.slice(0, 600),
    contentDirection: [purpose, goal].filter(Boolean).join(" — ").slice(0, 800),
    styleDirection: styleLabel(a.style),
    colorDirection: colorLabel(a.colors),
    imageryStrategy: imagery === "ai_choice" ? "Let Candor decide" : imagery,
    referenceUrl: refs[0] ?? null,
    designTokens: tokensFromColors(a.colors),
    imagery: defaultImageryPlan(imagery, purpose),
    avoid: [...GENERIC_AVOID],
    builderFreedom: freedom,
    strengths: {
      style: styleStr,
      colors: colorStr,
      imagery: imagery === "ai_choice" ? "freedom" : imagery === "generate" ? "preference" : "hard",
      darkMode:
        colorStr === "hard" &&
        (colorLabel(a.colors).toLowerCase().includes("dark") ||
          (typeof a.colors === "object" &&
            a.colors &&
            (a.colors as { mode?: string }).mode === "dark"))
          ? "hard"
          : "freedom",
    },
    referenceTraits: [],
    updatedAt: new Date().toISOString(),
  };
}

function extractAudience(goal: string): string {
  const m = goal.match(
    /(?:for|audience|customers?|clients?|buyers?|teams?)\s+([^.]{8,80})/i,
  );
  return m?.[1]?.trim() || "Prospective customers and stakeholders";
}

export function formatDesignBriefForPrompt(brief: CanonicalDesignBrief): string {
  const lines = [
    "## Canonical design brief (authoritative — do not treat raw onboarding as equal constraints)",
    `Purpose: ${brief.purpose}`,
    `Audience: ${brief.audience}`,
    `Primary goal: ${brief.primaryGoal}`,
    `Content direction: ${brief.contentDirection}`,
    `Style (strength=${brief.strengths?.style ?? "preference"}): ${brief.styleDirection}`,
    `Color (strength=${brief.strengths?.colors ?? "preference"}): ${brief.colorDirection}`,
    `Imagery: ${brief.imageryStrategy}`,
    brief.referenceUrl ? `Reference URL (inspiration only): ${brief.referenceUrl}` : null,
    brief.referenceTraits?.length
      ? `Reference traits: ${brief.referenceTraits.join("; ")}`
      : null,
    `Avoid: ${brief.avoid.join("; ")}`,
    brief.builderFreedom.length
      ? `AI freedom on: ${brief.builderFreedom.join(", ")}`
      : null,
    "Design tokens:",
    ...Object.entries(brief.designTokens).map(([k, v]) => `  - ${k}: ${v}`),
    "Imagery plan:",
    ...brief.imagery.map(
      (i) =>
        `  - ${i.role}: ${i.strategy} — ${i.description}${i.assetPath ? ` → ${i.assetPath}` : ""}`,
    ),
  ].filter(Boolean);
  return lines.join("\n");
}

export function emptyTwentyFirstStats(): TwentyFirstUsageStats {
  return {
    searchCount: 0,
    fetchCount: 0,
    selectedIds: [],
    componentFilesWritten: [],
    componentFilesImported: [],
    componentFilesUsedInRender: [],
  };
}

/** Soft-merge planner enrichments onto a starter brief. */
export function mergeDesignBrief(
  base: CanonicalDesignBrief,
  patch: Partial<CanonicalDesignBrief> | null | undefined,
): CanonicalDesignBrief {
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    designTokens: { ...base.designTokens, ...(patch.designTokens ?? {}) },
    imagery: patch.imagery?.length ? patch.imagery : base.imagery,
    avoid: patch.avoid?.length ? patch.avoid : base.avoid,
    builderFreedom: patch.builderFreedom ?? base.builderFreedom,
    strengths: { ...base.strengths, ...(patch.strengths ?? {}) },
    selectedComponents: patch.selectedComponents ?? base.selectedComponents,
    twentyFirstStats: patch.twentyFirstStats ?? base.twentyFirstStats,
    referenceTraits: patch.referenceTraits ?? base.referenceTraits,
    updatedAt: new Date().toISOString(),
  };
}

export function isAiChoiceValue(v: unknown): boolean {
  return isAiChoice(v) || v === AI_CHOICE_VALUE;
}
