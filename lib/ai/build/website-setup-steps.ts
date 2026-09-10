/**
 * Tap-first website setup steps. Every step is skippable and offers
 * “Let AI choose”; the values feed projects.project_spec (durable memory).
 *
 * Pure data + mapping helpers — safe for client and server.
 */

import { AI_CHOICE_VALUE } from "@/lib/ai/clarification/ai-choice";
import type {
  ClarificationChoice,
  ClarificationQuestion,
} from "@/lib/ai/clarification/schema";

export const WEBSITE_SETUP_STEP_KEYS = [
  "purpose",
  "primary_cta",
  "visual_direction",
  "palette",
  "typography",
  "component_style",
  "layout_direction",
  "pages",
  "features",
  "inspiration_urls",
  "identity",
  "anything_else",
] as const;

export type WebsiteSetupStepKey = (typeof WEBSITE_SETUP_STEP_KEYS)[number];

export type PaletteAnswer = {
  preset?: string;
  primary?: string;
  accent?: string;
  mode?: "light" | "dark" | "auto";
};

export type IdentityAnswer = {
  business_name?: string;
  tagline?: string;
  /** project_assets ids (uploaded through /api/projects/[id]/assets). */
  logo_asset_id?: string;
  favicon_asset_id?: string;
  /** "logo" = derive from logo, "upload" = favicon_asset_id, "generate" = builder makes app/icon.tsx */
  favicon_mode?: "logo" | "upload" | "generate";
  og_title?: string;
  og_description?: string;
};

export const VISUAL_DIRECTIONS: ClarificationChoice[] = [
  { id: "clean-saas", label: "Clean & modern", hint: "Crisp, lots of white space", recommended: true,
    preview: { kind: "style", bg: "#ffffff", fg: "#0f172a", accent: "#2563eb", radius: "10px" } },
  { id: "warm-local", label: "Warm & friendly", hint: "Approachable, earthy tones",
    preview: { kind: "style", bg: "#fbf7f0", fg: "#3b2f2f", accent: "#d97706", radius: "14px" } },
  { id: "editorial", label: "Editorial", hint: "Type-led, magazine feel",
    preview: { kind: "style", bg: "#faf9f6", fg: "#111111", accent: "#b91c1c", radius: "2px", font: "serif" } },
  { id: "bold-modern", label: "Bold", hint: "Big type, strong color",
    preview: { kind: "style", bg: "#0b0b0f", fg: "#ffffff", accent: "#f43f5e", radius: "6px" } },
  { id: "dark-premium", label: "Dark & premium", hint: "Luxury, understated",
    preview: { kind: "style", bg: "#0a0a0a", fg: "#e5e5e5", accent: "#c9a961", radius: "8px" } },
  { id: "playful", label: "Playful", hint: "Rounded, colorful, fun",
    preview: { kind: "style", bg: "#fff7ed", fg: "#1f2937", accent: "#8b5cf6", radius: "22px" } },
];

export const PALETTE_PRESETS: ClarificationChoice[] = [
  { id: "ocean", label: "Ocean", recommended: true,
    preview: { kind: "palette", primary: "#0f4c81", accent: "#38bdf8", background: "#ffffff", foreground: "#0f172a", mode: "light" } },
  { id: "forest", label: "Forest",
    preview: { kind: "palette", primary: "#1f5f3f", accent: "#a3e635", background: "#f7faf7", foreground: "#122117", mode: "light" } },
  { id: "sunset", label: "Sunset",
    preview: { kind: "palette", primary: "#c2410c", accent: "#fbbf24", background: "#fffaf5", foreground: "#2a1a10", mode: "light" } },
  { id: "plum", label: "Plum",
    preview: { kind: "palette", primary: "#5b21b6", accent: "#f472b6", background: "#fcfaff", foreground: "#1e1b2e", mode: "light" } },
  { id: "slate", label: "Slate",
    preview: { kind: "palette", primary: "#111827", accent: "#6366f1", background: "#ffffff", foreground: "#111827", mode: "light" } },
  { id: "midnight", label: "Midnight",
    preview: { kind: "palette", primary: "#e2e8f0", accent: "#22d3ee", background: "#0b1120", foreground: "#e2e8f0", mode: "dark" } },
  { id: "noir-gold", label: "Noir & gold",
    preview: { kind: "palette", primary: "#f5f5f4", accent: "#d4af37", background: "#0a0a0a", foreground: "#f5f5f4", mode: "dark" } },
  { id: "sand", label: "Sand",
    preview: { kind: "palette", primary: "#7c5e3c", accent: "#0f766e", background: "#f8f3ea", foreground: "#2b2118", mode: "light" } },
];

export const TYPOGRAPHY_PRESETS: ClarificationChoice[] = [
  { id: "modern-sans", label: "Modern sans", hint: "Inter + Inter", recommended: true,
    preview: { kind: "type", display: "Inter, ui-sans-serif, system-ui, sans-serif", body: "Inter, ui-sans-serif, system-ui, sans-serif" } },
  { id: "geometric", label: "Geometric", hint: "Manrope + DM Sans",
    preview: { kind: "type", display: "Manrope, Avenir, ui-sans-serif, sans-serif", body: "'DM Sans', ui-sans-serif, sans-serif" } },
  { id: "classic-serif", label: "Classic serif", hint: "Playfair Display + Source Sans",
    preview: { kind: "type", display: "'Playfair Display', Georgia, serif", body: "'Source Sans 3', ui-sans-serif, sans-serif" } },
  { id: "editorial-serif", label: "Editorial", hint: "Fraunces + Inter",
    preview: { kind: "type", display: "Fraunces, 'Iowan Old Style', Georgia, serif", body: "Inter, ui-sans-serif, sans-serif" } },
  { id: "humanist", label: "Humanist", hint: "Nunito + Nunito Sans",
    preview: { kind: "type", display: "Nunito, 'Trebuchet MS', sans-serif", body: "'Nunito Sans', ui-sans-serif, sans-serif" } },
  { id: "mono-accent", label: "Technical", hint: "Space Grotesk + JetBrains Mono accents",
    preview: { kind: "type", display: "'Space Grotesk', ui-sans-serif, sans-serif", body: "Inter, ui-sans-serif, sans-serif", sample: "Ship faster_" } },
];

export const COMPONENT_STYLES: ClarificationChoice[] = [
  { id: "soft", label: "Soft", hint: "Rounded, gentle shadows", recommended: true,
    preview: { kind: "component", radius: "14px", shadow: "0 8px 24px rgba(0,0,0,.08)", border: "transparent", density: "regular", button: "rounded" } },
  { id: "pill", label: "Pill", hint: "Rounded cards, pill buttons",
    preview: { kind: "component", radius: "20px", shadow: "0 6px 20px rgba(0,0,0,.06)", border: "transparent", density: "airy", button: "pill" } },
  { id: "sharp", label: "Sharp", hint: "Square corners, flat",
    preview: { kind: "component", radius: "2px", shadow: "none", border: "currentColor", density: "compact", button: "square" } },
  { id: "outlined", label: "Outlined", hint: "Thin borders, no shadow",
    preview: { kind: "component", radius: "8px", shadow: "none", border: "rgba(0,0,0,.18)", density: "regular", button: "rounded" } },
  { id: "elevated", label: "Elevated", hint: "Layered, deeper shadows",
    preview: { kind: "component", radius: "12px", shadow: "0 16px 40px rgba(0,0,0,.16)", border: "transparent", density: "airy", button: "rounded" } },
];

export const LAYOUT_DIRECTIONS: ClarificationChoice[] = [
  { id: "centered", label: "Centered", hint: "Classic hero, centered sections", recommended: true, preview: { kind: "layout", arrangement: "centered" } },
  { id: "left", label: "Left-aligned", hint: "Editorial, text-first", preview: { kind: "layout", arrangement: "left" } },
  { id: "split", label: "Split hero", hint: "Copy left, image right", preview: { kind: "layout", arrangement: "split" } },
  { id: "bleed", label: "Full-bleed imagery", hint: "Big photos, overlays", preview: { kind: "layout", arrangement: "bleed" } },
  { id: "grid", label: "Grid-heavy", hint: "Cards and tiles", preview: { kind: "layout", arrangement: "grid" } },
];

export const CTA_CHOICES: ClarificationChoice[] = [
  { id: "book", label: "Book a call", preview: { kind: "icon", name: "calendar" }, recommended: true },
  { id: "quote", label: "Get a quote", preview: { kind: "icon", name: "file-text" } },
  { id: "buy", label: "Buy / Order", preview: { kind: "icon", name: "shopping-bag" } },
  { id: "signup", label: "Sign up", preview: { kind: "icon", name: "user-plus" } },
  { id: "contact", label: "Contact us", preview: { kind: "icon", name: "mail" } },
  { id: "learn", label: "Learn more", preview: { kind: "icon", name: "arrow-right" } },
];

export const PAGE_CHOICES: ClarificationChoice[] = [
  { id: "home", label: "Home", recommended: true },
  { id: "about", label: "About", recommended: true },
  { id: "services", label: "Services", recommended: true },
  { id: "contact", label: "Contact", recommended: true },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },
  { id: "gallery", label: "Gallery / Work" },
  { id: "team", label: "Team" },
  { id: "blog", label: "Blog" },
  { id: "one_page", label: "One page only", hint: "Everything on the home page" },
];

export const FEATURE_CHOICES: ClarificationChoice[] = [
  { id: "contact_form", label: "Contact form", recommended: true },
  { id: "testimonials", label: "Testimonials", recommended: true },
  { id: "faq", label: "FAQ" },
  { id: "booking", label: "Booking / scheduling" },
  { id: "pricing_table", label: "Pricing table" },
  { id: "gallery", label: "Photo gallery" },
  { id: "newsletter", label: "Newsletter signup" },
  { id: "map", label: "Map & locations" },
  { id: "social", label: "Social links" },
  { id: "blog", label: "Blog / news" },
];

export const WEBSITE_SETUP_STEPS: ClarificationQuestion[] = [
  {
    id: "purpose",
    type: "textarea",
    label: "What is this site for?",
    description: "A sentence or two about the business and what the site should achieve.",
    placeholder: "We’re a family dental clinic in Austin. The site should get new patients to book.",
    required: false,
    aiChoice: false,
  },
  {
    id: "primary_cta",
    type: "visual_choice",
    label: "What should visitors do first?",
    description: "This becomes the main button across the site.",
    choices: CTA_CHOICES,
    required: false,
    aiChoice: true,
    allowCustom: true,
  },
  {
    id: "visual_direction",
    type: "visual_choice",
    label: "Pick a visual direction",
    choices: VISUAL_DIRECTIONS,
    required: false,
    aiChoice: true,
  },
  {
    id: "palette",
    type: "palette",
    label: "Colors",
    description: "Tap a palette, switch light/dark, or paste your brand hex codes.",
    choices: PALETTE_PRESETS,
    required: false,
    aiChoice: true,
    allowCustom: true,
  },
  {
    id: "typography",
    type: "type_sample",
    label: "Typography",
    choices: TYPOGRAPHY_PRESETS,
    required: false,
    aiChoice: true,
  },
  {
    id: "component_style",
    type: "visual_choice",
    label: "Component style",
    description: "Corners, shadows and buttons — shown on a sample card.",
    choices: COMPONENT_STYLES,
    required: false,
    aiChoice: true,
  },
  {
    id: "layout_direction",
    type: "visual_choice",
    label: "Layout",
    choices: LAYOUT_DIRECTIONS,
    required: false,
    aiChoice: true,
  },
  {
    id: "pages",
    type: "multi_choice",
    label: "Pages",
    description: "We’ve pre-selected a sensible set. Tap to change.",
    choices: PAGE_CHOICES,
    required: false,
    aiChoice: true,
    defaultValue: PAGE_CHOICES.filter((c) => c.recommended).map((c) => c.id),
  },
  {
    id: "features",
    type: "multi_choice",
    label: "Features",
    choices: FEATURE_CHOICES,
    required: false,
    aiChoice: true,
    defaultValue: FEATURE_CHOICES.filter((c) => c.recommended).map((c) => c.id),
  },
  {
    id: "inspiration_urls",
    type: "urls",
    label: "Any sites you like?",
    description: "Optional. We study structure, hierarchy and navigation — never copy content.",
    placeholder: "https://example.com",
    required: false,
    max: 3,
  },
  {
    id: "identity",
    type: "upload",
    label: "Name, logo & social preview",
    description: "Upload a logo (we’ll make the favicon) or let us generate one. Social title/description show when the link is shared.",
    required: false,
    aiChoice: true,
    uploadFields: ["business_name", "tagline", "logo", "favicon", "og_title", "og_description"],
  },
  {
    id: "anything_else",
    type: "textarea",
    label: "Anything else?",
    description: "Tone of voice, must-haves, things to avoid, opening hours, phone number…",
    placeholder: "Friendly but professional. Mention we’re open Saturdays.",
    required: false,
  },
];

export function isAiChoice(v: unknown): boolean {
  return v === AI_CHOICE_VALUE;
}

export function choiceLabel(list: ClarificationChoice[], id: unknown): string | null {
  if (typeof id !== "string") return null;
  return list.find((c) => c.id === id)?.label ?? id;
}

function paletteFromAnswer(v: unknown): PaletteAnswer | null {
  if (!v || typeof v !== "object") return typeof v === "string" && v !== AI_CHOICE_VALUE ? { preset: v } : null;
  return v as PaletteAnswer;
}

/** Human-readable palette description for prompts/spec. */
export function describePalette(v: unknown): string | null {
  const p = paletteFromAnswer(v);
  if (!p) return null;
  const preset = PALETTE_PRESETS.find((c) => c.id === p.preset);
  const parts: string[] = [];
  if (preset?.preview?.kind === "palette") {
    const pv = preset.preview;
    parts.push(`${preset.label}: primary ${pv.primary}, accent ${pv.accent}, background ${pv.background}, foreground ${pv.foreground}`);
  }
  if (p.primary) parts.push(`primary ${p.primary}`);
  if (p.accent) parts.push(`accent ${p.accent}`);
  if (p.mode && p.mode !== "auto") parts.push(`${p.mode} mode`);
  return parts.length ? parts.join("; ") : null;
}

export function paletteTokens(v: unknown): Record<string, string> | null {
  const p = paletteFromAnswer(v);
  if (!p) return null;
  const preset = PALETTE_PRESETS.find((c) => c.id === p.preset);
  const out: Record<string, string> = {};
  if (preset?.preview?.kind === "palette") {
    out.primary = preset.preview.primary;
    out.accent = preset.preview.accent;
    out.background = preset.preview.background;
    out.foreground = preset.preview.foreground;
    out.mode = preset.preview.mode;
  }
  if (p.primary) out.primary = p.primary;
  if (p.accent) out.accent = p.accent;
  if (p.mode && p.mode !== "auto") out.mode = p.mode;
  return Object.keys(out).length ? out : null;
}

export function typographyTokens(v: unknown): { display?: string; body?: string } | null {
  const preset = TYPOGRAPHY_PRESETS.find((c) => c.id === v);
  if (!preset || preset.preview?.kind !== "type") return null;
  return { display: preset.preview.display.split(",")[0].replace(/'/g, ""), body: preset.preview.body.split(",")[0].replace(/'/g, "") };
}

export function componentTokens(v: unknown): { radius?: string; shadow?: string; density?: string; buttons?: string; cards?: string } | null {
  const preset = COMPONENT_STYLES.find((c) => c.id === v);
  if (!preset || preset.preview?.kind !== "component") return null;
  const p = preset.preview;
  return {
    radius: p.radius,
    shadow: p.shadow === "none" ? "none" : p.shadow.includes("40px") ? "deep" : "soft",
    density: p.density,
    buttons: p.button,
    cards: p.border !== "transparent" ? "outlined" : p.shadow === "none" ? "flat" : "shadowed",
  };
}

export function identityFromAnswer(v: unknown): IdentityAnswer | null {
  if (!v || typeof v !== "object") return null;
  return v as IdentityAnswer;
}

export function urlsFromAnswer(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,]+/) : [];
  return list
    .map((x) => String(x).trim())
    .filter(Boolean)
    .map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`))
    .slice(0, 3);
}

/**
 * Bridge to the legacy 8-key brief shape still read by older prompts/tools.
 * Produces plain, descriptive strings; AI-chosen steps read as such.
 */
export function legacyAnswersFromSteps(a: Record<string, unknown>): Record<string, unknown> {
  const ai = "Let Cander decide";
  const identity = identityFromAnswer(a.identity);
  const pages = Array.isArray(a.pages) ? a.pages.map(String) : [];
  const depth = isAiChoice(a.pages)
    ? ai
    : pages.includes("one_page")
      ? "landing"
      : pages.length <= 3
        ? "small"
        : "multi";
  const cta = isAiChoice(a.primary_cta) ? ai : choiceLabel(CTA_CHOICES, a.primary_cta);
  return {
    business_goal: [
      identity?.business_name ? `${identity.business_name}${identity.tagline ? ` — ${identity.tagline}` : ""}.` : "",
      typeof a.purpose === "string" ? a.purpose : "",
    ]
      .filter(Boolean)
      .join(" ") || ai,
    audience_cta: cta ? `Primary CTA: ${cta}` : ai,
    site_depth: depth,
    visual_style: isAiChoice(a.visual_direction) ? ai : choiceLabel(VISUAL_DIRECTIONS, a.visual_direction) ?? ai,
    brand_colors: isAiChoice(a.palette) ? ai : describePalette(a.palette) ?? ai,
    layout_shape: [
      isAiChoice(a.layout_direction) ? null : choiceLabel(LAYOUT_DIRECTIONS, a.layout_direction),
      isAiChoice(a.component_style) ? null : choiceLabel(COMPONENT_STYLES, a.component_style),
      isAiChoice(a.typography) ? null : choiceLabel(TYPOGRAPHY_PRESETS, a.typography),
    ].filter(Boolean) as string[],
    copy_tone: typeof a.anything_else === "string" && a.anything_else.trim() ? a.anything_else : ai,
    sections_features: isAiChoice(a.features)
      ? ai
      : Array.isArray(a.features)
        ? a.features.map((f) => choiceLabel(FEATURE_CHOICES, f) ?? String(f))
        : ai,
  };
}
