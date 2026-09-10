/**
 * Typed design brief for guided website setup (8 steps + confirm).
 */

import type { ClarificationQuestion } from "@/lib/ai/clarification/schema";
import type { SiteSpec } from "@/lib/ai/build/site-spec";
import {
  WEBSITE_SETUP_STEPS,
  WEBSITE_SETUP_STEP_KEYS,
  legacyAnswersFromSteps,
  type IdentityAnswer,
  type PaletteAnswer,
} from "@/lib/ai/build/website-setup-steps";
import { cleanBriefAnswers } from "@/lib/ai/build/plan/spec-memory";

export type WebsiteSetupStatus = "setup" | "building" | "ready" | "failed";

export type WebsiteSetupAnswers = {
  // Tap-first steps (current). Values may be the AI_CHOICE_VALUE sentinel.
  purpose?: string;
  primary_cta?: string;
  visual_direction?: string;
  palette?: PaletteAnswer | string;
  typography?: string;
  component_style?: string;
  layout_direction?: string;
  pages?: string[] | string;
  features?: string[] | string;
  inspiration_urls?: string[] | string;
  identity?: IdentityAnswer | string;
  anything_else?: string;
  // Legacy 8-question brief (older projects; also derived from the steps).
  business_goal?: string;
  audience_cta?: string;
  site_depth?: string;
  visual_style?: string;
  brand_colors?: string;
  layout_shape?: string | string[];
  copy_tone?: string;
  sections_features?: string | string[];
  confirm_build?: boolean | string;
};

export type RetrievedComponentRef = {
  id: string;
  name: string;
  category: string;
  source: string;
  codeSnippet?: string;
  dependencies?: string[];
};

export type WebsiteSetupBrief = {
  status: WebsiteSetupStatus;
  /** Completed answer count among the 8 setup questions (0–8). */
  completedSteps: number;
  answers: WebsiteSetupAnswers;
  confirmedAt?: string;
  siteSpec?: SiteSpec | null;
  retrievedComponents?: RetrievedComponentRef[];
  validationIssues?: string[];
  updatedAt: string;
};

/** Legacy brief keys — still accepted and derived from the new steps. */
export const WEBSITE_SETUP_LEGACY_KEYS = [
  "business_goal",
  "audience_cta",
  "site_depth",
  "visual_style",
  "brand_colors",
  "layout_shape",
  "copy_tone",
  "sections_features",
] as const;

/** Current step keys (tap-first setup). */
export const WEBSITE_SETUP_ANSWER_KEYS = WEBSITE_SETUP_STEP_KEYS;

export type WebsiteSetupAnswerKey =
  | (typeof WEBSITE_SETUP_ANSWER_KEYS)[number]
  | (typeof WEBSITE_SETUP_LEGACY_KEYS)[number];

export const WEBSITE_SETUP_STEP_COUNT = WEBSITE_SETUP_STEPS.length;

/** The setup card's questions (tap-first, all skippable). */
export const WEBSITE_SETUP_QUESTIONS: ClarificationQuestion[] = WEBSITE_SETUP_STEPS;

export const WEBSITE_SETUP_RESUME_TOOL = "website.build_from_setup";

export function emptyWebsiteSetupBrief(
  partial?: Partial<WebsiteSetupBrief>,
): WebsiteSetupBrief {
  return {
    status: "setup",
    completedSteps: 0,
    answers: {},
    siteSpec: null,
    retrievedComponents: [],
    validationIssues: [],
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

function answerFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function countCompletedSetupSteps(
  answers: WebsiteSetupAnswers | Record<string, unknown>,
): number {
  const a = answers as Record<string, unknown>;
  let n = 0;
  for (const key of WEBSITE_SETUP_ANSWER_KEYS) {
    if (answerFilled(a[key])) n += 1;
  }
  if (n === 0) {
    // Legacy briefs answered the old 8 questions.
    for (const key of WEBSITE_SETUP_LEGACY_KEYS) {
      if (answerFilled(a[key])) n += 1;
    }
  }
  return n;
}

/**
 * Setup is complete once the user taps “Build my site” — every step is
 * skippable, so confirmation (not answer count) is the gate.
 */
export function isWebsiteSetupComplete(brief: WebsiteSetupBrief): boolean {
  return (
    brief.answers.confirm_build === true ||
    brief.answers.confirm_build === "true" ||
    Boolean(brief.confirmedAt)
  );
}

/**
 * True only while guided setup is still required.
 * Once the user confirms Build (or status leaves setup), chat/edits must not
 * be blocked by the setup card again.
 */
export function needsWebsiteGuidedSetup(
  brief: WebsiteSetupBrief | null | undefined,
): boolean {
  if (!brief) return true;
  if (brief.status !== "setup") return false;
  return !isWebsiteSetupComplete(brief);
}

/** Legacy-shaped view of the answers (steps mapped onto the 8 old keys). */
export function legacyBriefAnswers(
  answers: WebsiteSetupAnswers | Record<string, unknown>,
): WebsiteSetupAnswers {
  const a = answers as Record<string, unknown>;
  const hasSteps = WEBSITE_SETUP_ANSWER_KEYS.some((k) => answerFilled(a[k]));
  if (!hasSteps) return answers as WebsiteSetupAnswers;
  return { ...legacyAnswersFromSteps(a), ...pickLegacy(a), confirm_build: a.confirm_build as boolean | string | undefined } as WebsiteSetupAnswers;
}

function pickLegacy(a: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of WEBSITE_SETUP_LEGACY_KEYS) if (answerFilled(a[k])) out[k] = a[k];
  return out;
}

export function briefToPlanningPrompt(brief: WebsiteSetupBrief): string {
  const a = legacyBriefAnswers(brief.answers);
  const sections = Array.isArray(a.sections_features)
    ? a.sections_features.join(", ")
    : a.sections_features ?? "";
  const layout = Array.isArray(a.layout_shape)
    ? a.layout_shape.join(", ")
    : a.layout_shape ?? "";
  return [
    "Guided website setup brief (source of truth):",
    `- Business & goal: ${a.business_goal ?? ""}`,
    `- Audience & CTA: ${a.audience_cta ?? ""}`,
    `- Site depth: ${a.site_depth ?? ""}`,
    `- Visual style: ${a.visual_style ?? ""}`,
    `- Brand colors: ${a.brand_colors ?? ""}`,
    `- Layout shape: ${layout}`,
    `- Copy tone / content: ${a.copy_tone ?? ""}`,
    `- Sections/features: ${sections}`,
  ].join("\n");
}

/**
 * Natural-language user message for chat — hides raw field dumps.
 * Looks like something the user typed after answering the setup card.
 */
export function formatWebsiteSetupUserSummary(
  answers: WebsiteSetupAnswers | Record<string, unknown>,
): string {
  const a = legacyBriefAnswers(answers);
  const depth =
    a.site_depth === "landing"
      ? "a single landing page"
      : a.site_depth === "small"
        ? "a small multi-page site"
        : a.site_depth === "multi"
          ? "a multi-page marketing site"
          : "a website";
  const style = String(a.visual_style || "modern")
    .replace(/-/g, " ")
    .trim();
  const layout = Array.isArray(a.layout_shape)
    ? a.layout_shape.join(", ")
    : String(a.layout_shape || "").trim();
  const sections = Array.isArray(a.sections_features)
    ? a.sections_features.join(", ")
    : String(a.sections_features || "").trim();

  const parts = [
    `Create ${depth} for us.`,
    a.business_goal ? `Business & goal: ${String(a.business_goal).trim()}` : "",
    a.audience_cta
      ? `Audience & primary CTA: ${String(a.audience_cta).trim()}`
      : "",
    style ? `Visual direction: ${style}.` : "",
    a.brand_colors
      ? `Colors: ${String(a.brand_colors).trim()}.`
      : "",
    layout ? `Layout feel: ${layout}.` : "",
    a.copy_tone ? `Copy: ${String(a.copy_tone).trim()}.` : "",
    sections ? `Include sections for: ${sections}.` : "",
    "Build the draft site from this brief.",
  ].filter(Boolean);

  return parts.join(" ");
}

export function mergeAnswersIntoBrief(
  brief: WebsiteSetupBrief,
  answers: Record<string, unknown>,
): WebsiteSetupBrief {
  const nextAnswers: WebsiteSetupAnswers = {
    ...brief.answers,
  };
  const cleaned = cleanBriefAnswers(answers);
  for (const key of [...WEBSITE_SETUP_ANSWER_KEYS, ...WEBSITE_SETUP_LEGACY_KEYS]) {
    if (key in cleaned) {
      const v = cleaned[key];
      if (v === undefined) continue;
      if (typeof v === "string" || Array.isArray(v) || (v && typeof v === "object")) {
        nextAnswers[key] = v as never;
      }
    }
  }
  if ("confirm_build" in answers) {
    nextAnswers.confirm_build = answers.confirm_build as boolean | string;
  }
  const completedSteps = countCompletedSetupSteps(nextAnswers);
  const confirmed =
    nextAnswers.confirm_build === true ||
    nextAnswers.confirm_build === "true";
  return {
    ...brief,
    answers: nextAnswers,
    completedSteps,
    confirmedAt: confirmed
      ? brief.confirmedAt ?? new Date().toISOString()
      : brief.confirmedAt,
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeWebsiteSetupBrief(raw: unknown): WebsiteSetupBrief {
  if (!raw || typeof raw !== "object") return emptyWebsiteSetupBrief();
  const o = raw as Record<string, unknown>;
  const status =
    o.status === "building" ||
    o.status === "ready" ||
    o.status === "failed" ||
    o.status === "setup"
      ? o.status
      : "setup";
  const answers =
    o.answers && typeof o.answers === "object"
      ? cleanBriefAnswers(o.answers as Record<string, unknown>) as WebsiteSetupAnswers
      : {};
  return emptyWebsiteSetupBrief({
    status,
    completedSteps:
      typeof o.completedSteps === "number"
        ? Math.max(0, Math.min(WEBSITE_SETUP_STEP_COUNT, o.completedSteps))
        : countCompletedSetupSteps(answers),
    answers,
    confirmedAt: typeof o.confirmedAt === "string" ? o.confirmedAt : undefined,
    siteSpec: (o.siteSpec as SiteSpec | null | undefined) ?? null,
    retrievedComponents: Array.isArray(o.retrievedComponents)
      ? (o.retrievedComponents as RetrievedComponentRef[])
      : [],
    validationIssues: Array.isArray(o.validationIssues)
      ? o.validationIssues.map(String)
      : [],
    updatedAt:
      typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
  });
}
