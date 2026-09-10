/**
 * Typed design brief for guided website setup (8 steps + confirm).
 */

import type { ClarificationQuestion } from "@/lib/ai/clarification/schema";
import type { SiteSpec } from "@/lib/ai/build/site-spec";
import { cleanBriefAnswers } from "@/lib/ai/build/plan/spec-memory";

export type WebsiteSetupStatus = "setup" | "building" | "ready" | "failed";

export type WebsiteSetupAnswers = {
  business_goal?: string;
  audience_cta?: string;
  site_depth?: string;
  visual_style?: string;
  brand_colors?: string;
  layout_shape?: string;
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

export const WEBSITE_SETUP_ANSWER_KEYS = [
  "business_goal",
  "audience_cta",
  "site_depth",
  "visual_style",
  "brand_colors",
  "layout_shape",
  "copy_tone",
  "sections_features",
] as const;

export type WebsiteSetupAnswerKey = (typeof WEBSITE_SETUP_ANSWER_KEYS)[number];

export const WEBSITE_SETUP_QUESTIONS: ClarificationQuestion[] = [
  {
    id: "business_goal",
    type: "textarea",
    label: "What does the business do, and what’s the primary goal of this site?",
    description: "E.g. local clinic booking more appointments, SaaS product signups.",
    placeholder: "We’re a … Our site should …",
    required: true,
  },
  {
    id: "audience_cta",
    type: "textarea",
    label: "Who is the audience, and what’s the primary call to action?",
    description: "Who should visit, and what should they do?",
    placeholder: "Audience: … CTA: Book a call / Buy / Get a quote…",
    required: true,
  },
  {
    id: "site_depth",
    type: "single_choice",
    label: "How deep should the site be?",
    required: true,
    choices: [
      { id: "landing", label: "Single landing page" },
      { id: "small", label: "Small site (Home + a few pages)" },
      { id: "multi", label: "Multi-page (services, about, contact, …)" },
    ],
  },
  {
    id: "visual_style",
    type: "single_choice",
    label: "Visual style direction",
    required: true,
    choices: [
      { id: "clean-saas", label: "Clean SaaS" },
      { id: "warm-local", label: "Warm local / trust" },
      { id: "editorial", label: "Editorial" },
      { id: "bold-modern", label: "Bold modern" },
      { id: "dark-premium", label: "Dark premium" },
    ],
  },
  {
    id: "brand_colors",
    type: "textarea",
    label: "Brand colors",
    description: "Hex codes, brand names, or a short palette note.",
    placeholder: "Primary #0F172A, accent #38BDF8, or “navy and soft gold”",
    required: true,
  },
  {
    id: "layout_shape",
    type: "multi_choice",
    label: "Layout shape",
    description: "Pick the feel that fits best.",
    required: true,
    choices: [
      { id: "rounded", label: "Rounded" },
      { id: "sharp", label: "Sharp" },
      { id: "spacious", label: "Spacious" },
      { id: "dense", label: "Dense" },
      { id: "minimal", label: "Minimal" },
      { id: "layered", label: "Layered" },
    ],
  },
  {
    id: "copy_tone",
    type: "textarea",
    label: "Copy tone — and real content vs AI placeholders?",
    description:
      "Tone (friendly, formal, punchy…) and whether to invent placeholder copy or wait for real text.",
    placeholder: "Tone: professional but warm. Use AI draft copy for now.",
    required: true,
  },
  {
    id: "sections_features",
    type: "multi_choice",
    label: "Required sections & features",
    required: true,
    choices: [
      { id: "services", label: "Services" },
      { id: "gallery", label: "Gallery" },
      { id: "testimonials", label: "Testimonials" },
      { id: "faq", label: "FAQ" },
      { id: "forms", label: "Forms" },
      { id: "contact", label: "Contact" },
      { id: "locations", label: "Locations" },
      { id: "pricing", label: "Pricing" },
    ],
  },
  {
    id: "confirm_build",
    type: "boolean",
    label: "Ready to build your site from these answers?",
    description: "We’ll design from your brief, pull matching components, then compose the draft.",
    required: true,
  },
];

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
  let n = 0;
  for (const key of WEBSITE_SETUP_ANSWER_KEYS) {
    if (answerFilled(answers[key])) n += 1;
  }
  return n;
}

export function isWebsiteSetupComplete(brief: WebsiteSetupBrief): boolean {
  return (
    countCompletedSetupSteps(brief.answers) >= 8 &&
    (brief.answers.confirm_build === true ||
      brief.answers.confirm_build === "true" ||
      Boolean(brief.confirmedAt))
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

export function briefToPlanningPrompt(brief: WebsiteSetupBrief): string {
  const a = brief.answers;
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
  const a = answers as WebsiteSetupAnswers;
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
  for (const key of WEBSITE_SETUP_ANSWER_KEYS) {
    if (key in cleaned) {
      const v = cleaned[key];
      if (typeof v === "string" || Array.isArray(v)) {
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
        ? Math.max(0, Math.min(8, o.completedSteps))
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
