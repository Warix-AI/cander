/**
 * projects.project_spec as the single durable memory for a website project.
 *
 * - Seeded from the setup brief on the first build.
 * - Loaded into every build job (config.json → builder prompts, and mirrored
 *   into the repo as cander.spec.json / DESIGN.md so the coder can read it).
 * - Patched by the builder's `update_project_spec` tool for lasting decisions.
 *
 * Pure helpers live here; DB access goes through lib/ai/build/plan/store.ts.
 */

import type { ProjectKind, ProjectSpec, ProjectSpecDecision } from "./types.ts";
import { normalizeProjectSpec } from "./normalize.ts";
import { projectSpecFromBriefHeuristic } from "./heuristics.ts";
import {
  CTA_CHOICES,
  FEATURE_CHOICES,
  LAYOUT_DIRECTIONS,
  PAGE_CHOICES,
  VISUAL_DIRECTIONS,
  choiceLabel,
  componentTokens,
  identityFromAnswer,
  isAiChoice,
  paletteTokens,
  typographyTokens,
  urlsFromAnswer,
} from "@/lib/ai/build/website-setup-steps";

export const PROJECT_SPEC_REPO_PATH = "cander.spec.json";
export const PROJECT_DESIGN_DOC_REPO_PATH = "DESIGN.md";

/**
 * Strings that went through JSON.stringify twice show up as `"\"value\""`.
 * Unwrap them (repeatedly) so briefs and specs read cleanly everywhere.
 */
export function unwrapDoubleEncodedString(value: string): string {
  let out = value.trim();
  for (let i = 0; i < 3; i += 1) {
    if (out.length >= 2 && out.startsWith('"') && out.endsWith('"')) {
      try {
        const parsed: unknown = JSON.parse(out);
        if (typeof parsed === "string") {
          out = parsed.trim();
          continue;
        }
      } catch {
        // Not valid JSON — strip the bare quotes instead.
        out = out.slice(1, -1).trim();
        continue;
      }
    }
    break;
  }
  return out;
}

/** Deep-clean a brief/answers object: unwrap double-encoded strings. */
export function cleanBriefAnswers<T extends Record<string, unknown>>(answers: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(answers)) {
    if (typeof v === "string") out[k] = unwrapDoubleEncodedString(v);
    else if (Array.isArray(v)) {
      out[k] = v.map((x) => (typeof x === "string" ? unwrapDoubleEncodedString(x) : x));
    } else out[k] = v;
  }
  return out as T;
}

function listFromAnswer(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v !== "string") return [];
  return v
    .split(/[,;\n]|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Seed a ProjectSpec from the guided setup answers (8 questions). Keeps the
 * raw wording — the planner refines it, the spec stays the source of truth.
 */
export function projectSpecFromSetupBrief(opts: {
  answers: Record<string, unknown> | null | undefined;
  projectName: string;
  kind: ProjectKind;
  instruction?: string | null;
}): ProjectSpec {
  const a = cleanBriefAnswers(opts.answers ?? {});
  if (hasStepAnswers(a)) return projectSpecFromSetupSteps({ ...opts, answers: a });
  const base = projectSpecFromBriefHeuristic({ answers: a }, opts.instruction ?? "");
  const businessGoal = String(a.business_goal ?? "").trim();
  const audienceCta = String(a.audience_cta ?? "").trim();
  const now = new Date().toISOString();

  const spec: ProjectSpec = {
    ...base,
    kind: opts.kind,
    businessName:
      base.businessName !== "New business" ? base.businessName : opts.projectName || "New business",
    intent: businessGoal || base.intent,
    audience: audienceCta || base.audience,
    goals: [businessGoal, ...base.goals.filter((g) => g !== base.intent)].filter(Boolean).slice(0, 6),
    tone: String(a.copy_tone ?? "").trim() || base.tone,
    features: listFromAnswer(a.sections_features),
    visual: {
      direction: String(a.visual_style ?? "").trim() || undefined,
      layout: listFromAnswer(a.layout_shape).join(", ") || undefined,
      palette: (() => {
        const raw = String(a.brand_colors ?? "").trim();
        return raw ? { notes: raw } : undefined;
      })(),
    },
    technical: [
      "Next.js App Router + Tailwind v4; design tokens live in app/globals.css (:root variables + @theme inline).",
      "Fonts load via <link> in app/layout.tsx or system stacks (no next/font/google).",
      "Shared layout pieces live in components/site/*; primitives in components/ui/*.",
    ],
    userInstructions: opts.instruction?.trim() ? [opts.instruction.trim().slice(0, 600)] : [],
    decisions: [
      {
        at: now,
        summary: `Seeded from setup brief${a.site_depth ? ` (site depth: ${String(a.site_depth)})` : ""}.`,
        source: "setup",
      },
    ],
    updatedAt: now,
  };
  if (spec.visual && !spec.visual.direction && !spec.visual.layout && !spec.visual.palette) {
    delete spec.visual;
  }
  return normalizeProjectSpec(spec) ?? spec;
}

const STEP_KEYS = [
  "purpose", "primary_cta", "visual_direction", "palette", "typography", "component_style",
  "layout_direction", "pages", "features", "inspiration_urls", "identity", "anything_else",
];

function hasStepAnswers(a: Record<string, unknown>): boolean {
  return STEP_KEYS.some((k) => a[k] !== undefined && a[k] !== "" && !(Array.isArray(a[k]) && !(a[k] as unknown[]).length));
}

const PAGE_ROUTES: Record<string, { path: string; title: string; purpose: string }> = {
  home: { path: "/", title: "Home", purpose: "Hero, value proposition, proof, primary CTA" },
  about: { path: "/about", title: "About", purpose: "Story, team, values, trust" },
  services: { path: "/services", title: "Services", purpose: "What we offer and for whom" },
  contact: { path: "/contact", title: "Contact", purpose: "Form, details, map or hours" },
  pricing: { path: "/pricing", title: "Pricing", purpose: "Plans or packages with CTA" },
  faq: { path: "/faq", title: "FAQ", purpose: "Objections and practical questions" },
  gallery: { path: "/work", title: "Work", purpose: "Gallery or case studies" },
  team: { path: "/team", title: "Team", purpose: "People and roles" },
  blog: { path: "/blog", title: "Blog", purpose: "Articles and news" },
};

const CTA_HREF: Record<string, string> = {
  book: "/contact",
  quote: "/contact",
  buy: "/pricing",
  signup: "/contact",
  contact: "/contact",
  learn: "/about",
};

/** Seed from the tap-first steps; “Let Cander choose” leaves a field open for the planner. */
function projectSpecFromSetupSteps(opts: {
  answers: Record<string, unknown>;
  projectName: string;
  kind: ProjectKind;
  instruction?: string | null;
}): ProjectSpec {
  const a = opts.answers;
  const now = new Date().toISOString();
  const identity = identityFromAnswer(a.identity);
  const purpose = typeof a.purpose === "string" ? a.purpose.trim() : "";
  const extra = typeof a.anything_else === "string" ? a.anything_else.trim() : "";
  const businessName = identity?.business_name?.trim() || opts.projectName || "New business";

  const ctaId = isAiChoice(a.primary_cta) ? null : typeof a.primary_cta === "string" ? a.primary_cta : null;
  const ctaLabel = ctaId ? choiceLabel(CTA_CHOICES, ctaId) : null;
  const ctas: ProjectSpec["ctas"] = ctaLabel
    ? [{ label: ctaLabel.replace(" / Order", ""), href: CTA_HREF[ctaId!] ?? "/contact", primary: true }]
    : [];

  const pageIds = isAiChoice(a.pages) ? null : Array.isArray(a.pages) ? a.pages.map(String) : null;
  const onePage = pageIds?.includes("one_page") ?? false;
  const pages = pageIds
    ? onePage
      ? [PAGE_ROUTES.home]
      : ["home", ...pageIds.filter((p) => p !== "home" && p !== "one_page")]
          .map((id) => PAGE_ROUTES[id])
          .filter(Boolean)
    : undefined;

  const features = isAiChoice(a.features)
    ? undefined
    : Array.isArray(a.features)
      ? a.features.map((f) => choiceLabel(FEATURE_CHOICES, f) ?? String(f))
      : undefined;
  if (features && onePage) features.push("Single-page layout with anchor navigation");

  const direction = isAiChoice(a.visual_direction) ? undefined : choiceLabel(VISUAL_DIRECTIONS, a.visual_direction) ?? undefined;
  const palette = isAiChoice(a.palette) ? null : paletteTokens(a.palette);
  const typography = isAiChoice(a.typography) ? null : typographyTokens(a.typography);
  const components = isAiChoice(a.component_style) ? null : componentTokens(a.component_style);
  const layout = isAiChoice(a.layout_direction) ? undefined : choiceLabel(LAYOUT_DIRECTIONS, a.layout_direction) ?? undefined;

  const visual: ProjectSpec["visual"] = {};
  if (direction) visual.direction = direction;
  if (palette) {
    const { mode, ...colors } = palette;
    visual.palette = { ...colors, ...(mode ? { mode } : {}) };
  }
  if (typography) visual.typography = typography;
  if (components) visual.components = components;
  if (layout) visual.layout = layout;

  const brand: NonNullable<ProjectSpec["brand"]> = {};
  const faviconMode = identity?.favicon_mode ?? (identity?.logo_asset_id ? "logo" : "generate");
  const technical = [
    "Next.js App Router + Tailwind v4; design tokens live in app/globals.css (:root variables + @theme inline).",
    "Fonts load via <link> in app/layout.tsx or system stacks (no next/font/google).",
    "Shared layout pieces live in components/site/*; primitives in components/ui/*.",
    faviconMode === "generate"
      ? "Favicon: generate app/icon.tsx with ImageResponse (brand mark or initials on the primary color) and app/apple-icon.tsx."
      : "Favicon: derive app/icon.png + app/apple-icon.png from the uploaded brand asset (public/brand/).",
  ];
  const userInstructions: string[] = [];
  if (extra) userInstructions.push(extra.slice(0, 600));
  if (opts.instruction?.trim()) userInstructions.push(opts.instruction.trim().slice(0, 600));
  if (identity?.og_title) userInstructions.push(`Social share title: “${identity.og_title.trim()}”.`);
  if (identity?.og_description) userInstructions.push(`Social share description: “${identity.og_description.trim()}”.`);

  const spec: ProjectSpec = {
    version: 1,
    kind: opts.kind,
    businessName,
    tagline: identity?.tagline?.trim() || undefined,
    intent: purpose || `Marketing website for ${businessName}`,
    goals: purpose ? [purpose.slice(0, 200)] : [],
    ctas,
    pages,
    features,
    visual: Object.keys(visual).length ? visual : undefined,
    inspiration: urlsFromAnswer(a.inspiration_urls).map((url) => ({ url, summary: "" })),
    brand: Object.keys(brand).length ? brand : undefined,
    technical,
    userInstructions,
    decisions: [
      {
        at: now,
        summary: `Seeded from tap-first setup (${STEP_KEYS.filter((k) => !isAiChoice(a[k]) && a[k] !== undefined).length} answered, rest left to Cander).`,
        source: "setup",
      },
    ],
    updatedAt: now,
  };
  if (identity?.logo_asset_id) spec.brand = { ...(spec.brand ?? {}), logoPath: `asset:${identity.logo_asset_id}` };
  if (identity?.favicon_asset_id) spec.brand = { ...(spec.brand ?? {}), faviconPath: `asset:${identity.favicon_asset_id}` };
  if (!spec.inspiration?.length) delete spec.inspiration;
  return normalizeProjectSpec(spec) ?? spec;
}

/**
 * Merge a patch from the builder/user into the spec. Arrays replace; nested
 * `visual`/`brand` objects merge one level deep; `decisions` append.
 */
export function mergeProjectSpecPatch(
  current: ProjectSpec,
  patch: Record<string, unknown>,
  decision?: { summary: string; source: ProjectSpecDecision["source"] },
): ProjectSpec {
  const next: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "version" || k === "kind" || k === "decisions" || v === undefined) continue;
    if ((k === "visual" || k === "brand") && v && typeof v === "object" && !Array.isArray(v)) {
      const prev = (current as Record<string, unknown>)[k];
      const prevObj = prev && typeof prev === "object" ? (prev as Record<string, unknown>) : {};
      const merged: Record<string, unknown> = { ...prevObj };
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        if (sv && typeof sv === "object" && !Array.isArray(sv)) {
          const prevSub = merged[sk];
          merged[sk] = {
            ...(prevSub && typeof prevSub === "object" ? (prevSub as Record<string, unknown>) : {}),
            ...(sv as Record<string, unknown>),
          };
        } else merged[sk] = sv;
      }
      next[k] = merged;
      continue;
    }
    if (k === "userInstructions" || k === "technical" || k === "features") {
      // Additive lists: keep existing entries, add new unique ones.
      const prev = Array.isArray(current[k as keyof ProjectSpec])
        ? (current[k as keyof ProjectSpec] as string[])
        : [];
      const add = Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : [];
      next[k] = Array.from(new Set([...prev, ...add.map((s) => s.trim()).filter(Boolean)])).slice(0, 40);
      continue;
    }
    next[k] = v;
  }
  const now = new Date().toISOString();
  const decisions = [...(current.decisions ?? [])];
  if (decision?.summary?.trim()) {
    decisions.push({ at: now, summary: decision.summary.trim().slice(0, 300), source: decision.source });
  }
  next.decisions = decisions.slice(-60);
  next.updatedAt = now;
  return normalizeProjectSpec(next) ?? current;
}

/** Files mirrored into the customer repo so the coder can read the spec. */
export function projectSpecRepoFiles(spec: ProjectSpec): Array<{ path: string; content: string }> {
  return [
    { path: PROJECT_SPEC_REPO_PATH, content: `${JSON.stringify(spec, null, 2)}\n` },
    { path: PROJECT_DESIGN_DOC_REPO_PATH, content: renderDesignDoc(spec) },
  ];
}

/** Human-readable DESIGN.md — the same renderer the builder uses in-sandbox. */
export function renderDesignDoc(spec: ProjectSpec): string {
  const lines: string[] = [`# ${spec.businessName} — project spec`, ""];
  lines.push(
    "_Maintained by Cander. This is the durable memory for the site: purpose, audience, pages, and the visual language every change must respect. Update it through `update_project_spec`, not by hand._",
    "",
  );
  lines.push("## Purpose", spec.intent, "");
  if (spec.tagline) lines.push(`**Tagline:** ${spec.tagline}`, "");
  if (spec.audience) lines.push("## Audience", spec.audience, "");
  if (spec.goals?.length) lines.push("## Goals", ...spec.goals.map((g) => `- ${g}`), "");
  if (spec.ctas?.length) {
    lines.push(
      "## Calls to action",
      ...spec.ctas.map((c) => `- ${c.primary ? "**Primary:** " : ""}${c.label}${c.href ? ` → ${c.href}` : ""}`),
      "",
    );
  }
  if (spec.pages?.length) {
    lines.push("## Pages", ...spec.pages.map((p) => `- \`${p.path}\` — ${p.title}${p.purpose ? `: ${p.purpose}` : ""}`), "");
  }
  if (spec.features?.length) lines.push("## Features", ...spec.features.map((f) => `- ${f}`), "");
  const v = spec.visual;
  if (v) {
    lines.push("## Visual language");
    if (v.direction) lines.push(`- Direction: ${v.direction}`);
    if (v.mood?.length) lines.push(`- Mood: ${v.mood.join(", ")}`);
    if (v.layout) lines.push(`- Layout: ${v.layout}`);
    if (v.palette) {
      const entries = Object.entries(v.palette).filter(([, val]) => val);
      if (entries.length) lines.push(`- Palette: ${entries.map(([k, val]) => `${k} ${val}`).join(", ")}`);
    }
    if (v.typography) {
      const t = v.typography;
      lines.push(`- Typography: ${[t.display && `display ${t.display}`, t.body && `body ${t.body}`, t.scale && `scale ${t.scale}`].filter(Boolean).join("; ")}`);
    }
    if (v.components) {
      const c = v.components;
      const parts = Object.entries(c).filter(([, val]) => val).map(([k, val]) => `${k}: ${val}`);
      if (parts.length) lines.push(`- Components: ${parts.join("; ")}`);
    }
    lines.push("");
  }
  if (spec.brand && Object.keys(spec.brand).length) {
    lines.push("## Brand assets");
    for (const [k, val] of Object.entries(spec.brand)) if (val) lines.push(`- ${k}: ${val}`);
    lines.push("");
  }
  if (spec.inspiration?.length) {
    lines.push("## Inspiration", ...spec.inspiration.map((i) => `- ${i.url}${i.summary ? ` — ${i.summary}` : ""}`), "");
  }
  if (spec.tone) lines.push("## Copy tone", spec.tone, "");
  if (spec.technical?.length) lines.push("## Technical conventions", ...spec.technical.map((t) => `- ${t}`), "");
  if (spec.userInstructions?.length) {
    lines.push("## Standing instructions from the user", ...spec.userInstructions.map((t) => `- ${t}`), "");
  }
  if (spec.constraints?.length) lines.push("## Constraints", ...spec.constraints.map((t) => `- ${t}`), "");
  if (spec.decisions?.length) {
    lines.push(
      "## Decision log",
      ...spec.decisions.slice(-20).map((d) => `- ${d.at.slice(0, 10)} (${d.source}): ${d.summary}`),
      "",
    );
  }
  if (spec.lastEditSummary) lines.push("## Last change", spec.lastEditSummary, "");
  return `${lines.join("\n").trimEnd()}\n`;
}
