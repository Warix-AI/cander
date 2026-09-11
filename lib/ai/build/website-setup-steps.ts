/**
 * Short tap-first website setup (≤6 questions, under a minute).
 * Legacy 12-step + 8-key briefs normalize into these fields.
 * Pure data + mapping — safe for client and server.
 */

import { AI_CHOICE_VALUE } from "@/lib/ai/clarification/ai-choice";
import type {
  ClarificationChoice,
  ClarificationQuestion,
} from "@/lib/ai/clarification/schema";

/** Current short onboarding keys. */
export const WEBSITE_SETUP_STEP_KEYS = [
  "purpose",
  "goal",
  "style",
  "colors",
  "imagery",
  "reference_url",
] as const;

export type WebsiteSetupStepKey = (typeof WEBSITE_SETUP_STEP_KEYS)[number];

/** @deprecated Kept for reading older briefs. */
export const WEBSITE_SETUP_LEGACY_STEP_KEYS = [
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

export type PaletteAnswer = {
  preset?: string;
  primary?: string;
  accent?: string;
  background?: string;
  foreground?: string;
  mode?: "light" | "dark" | "auto";
  /** Free-text color direction, e.g. "black, white, cyan" or hex list. */
  custom?: string;
};

export type ColorsAnswer = PaletteAnswer | string;

export type IdentityAnswer = {
  business_name?: string;
  tagline?: string;
  logo_asset_id?: string;
  favicon_asset_id?: string;
  favicon_mode?: "logo" | "upload" | "generate";
  og_title?: string;
  og_description?: string;
};

export type ImageryStrategy =
  | "generate"
  | "placeholder"
  | "user_upload"
  | "minimal"
  | "ai_choice";

export const STYLE_DIRECTIONS: ClarificationChoice[] = [
  {
    id: "minimal",
    label: "Minimal",
    hint: "Quiet, lots of space",
    recommended: true,
    preview: { kind: "style", bg: "#ffffff", fg: "#111111", accent: "#2563eb", radius: "6px" },
  },
  {
    id: "modern",
    label: "Modern",
    hint: "Clean product feel",
    preview: { kind: "style", bg: "#f8fafc", fg: "#0f172a", accent: "#0ea5e9", radius: "10px" },
  },
  {
    id: "bold",
    label: "Bold",
    hint: "Strong type and contrast",
    preview: { kind: "style", bg: "#0b0b0f", fg: "#ffffff", accent: "#f43f5e", radius: "4px" },
  },
  {
    id: "premium",
    label: "Premium",
    hint: "Restrained luxury",
    preview: { kind: "style", bg: "#0a0a0a", fg: "#e5e5e5", accent: "#c9a961", radius: "8px" },
  },
  {
    id: "editorial",
    label: "Editorial",
    hint: "Type-led, magazine",
    preview: { kind: "style", bg: "#faf9f6", fg: "#111111", accent: "#b91c1c", radius: "2px", font: "serif" },
  },
  {
    id: "playful",
    label: "Playful",
    hint: "Friendly and colorful",
    preview: { kind: "style", bg: "#fff7ed", fg: "#1f2937", accent: "#8b5cf6", radius: "18px" },
  },
  {
    id: "technical",
    label: "Technical",
    hint: "Precise, engineering",
    preview: { kind: "style", bg: "#0b1120", fg: "#e2e8f0", accent: "#22d3ee", radius: "4px" },
  },
];

/** Alias for older imports. */
export const VISUAL_DIRECTIONS = STYLE_DIRECTIONS;

export const COLOR_CHOICES: ClarificationChoice[] = [
  { id: "light", label: "Light", hint: "Bright backgrounds", recommended: true },
  { id: "dark", label: "Dark", hint: "Dark backgrounds" },
  { id: "custom", label: "Enter brand colors", hint: "Hex or “black, white, cyan”" },
];

export const IMAGERY_CHOICES: ClarificationChoice[] = [
  {
    id: "generate",
    label: "Generate imagery",
    hint: "Candor creates fitting visuals",
    recommended: true,
  },
  {
    id: "placeholder",
    label: "Polished placeholders",
    hint: "Replace them later",
  },
  {
    id: "user_upload",
    label: "I’ll provide images",
    hint: "Use placeholders until you upload",
  },
  {
    id: "minimal",
    label: "Minimal / no imagery",
    hint: "Typography and color first",
  },
];

/** Kept for legacy brief mapping / older UI widgets. */
export const PALETTE_PRESETS: ClarificationChoice[] = [
  {
    id: "ocean",
    label: "Ocean",
    recommended: true,
    preview: {
      kind: "palette",
      primary: "#0f4c81",
      accent: "#38bdf8",
      background: "#ffffff",
      foreground: "#0f172a",
      mode: "light",
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    preview: {
      kind: "palette",
      primary: "#e2e8f0",
      accent: "#22d3ee",
      background: "#0b1120",
      foreground: "#e2e8f0",
      mode: "dark",
    },
  },
  {
    id: "slate",
    label: "Slate",
    preview: {
      kind: "palette",
      primary: "#111827",
      accent: "#6366f1",
      background: "#ffffff",
      foreground: "#111827",
      mode: "light",
    },
  },
];

export const TYPOGRAPHY_PRESETS: ClarificationChoice[] = [
  {
    id: "modern-sans",
    label: "Modern sans",
    recommended: true,
    preview: {
      kind: "type",
      display: "Inter, ui-sans-serif, system-ui, sans-serif",
      body: "Inter, ui-sans-serif, system-ui, sans-serif",
    },
  },
  {
    id: "mono-accent",
    label: "Technical",
    preview: {
      kind: "type",
      display: "'Space Grotesk', ui-sans-serif, sans-serif",
      body: "Inter, ui-sans-serif, sans-serif",
      sample: "Ship faster_",
    },
  },
];

export const COMPONENT_STYLES: ClarificationChoice[] = [
  {
    id: "soft",
    label: "Soft",
    recommended: true,
    preview: {
      kind: "component",
      radius: "14px",
      shadow: "0 8px 24px rgba(0,0,0,.08)",
      border: "transparent",
      density: "regular",
      button: "rounded",
    },
  },
];

export const LAYOUT_DIRECTIONS: ClarificationChoice[] = [
  {
    id: "centered",
    label: "Centered",
    recommended: true,
    preview: { kind: "layout", arrangement: "centered" },
  },
];

export const CTA_CHOICES: ClarificationChoice[] = [
  { id: "contact", label: "Contact us", recommended: true },
  { id: "book", label: "Book a call" },
  { id: "quote", label: "Get a quote" },
];

export const PAGE_CHOICES: ClarificationChoice[] = [
  { id: "home", label: "Home", recommended: true },
  { id: "about", label: "About", recommended: true },
  { id: "services", label: "Services", recommended: true },
  { id: "contact", label: "Contact", recommended: true },
];

export const FEATURE_CHOICES: ClarificationChoice[] = [
  { id: "contact_form", label: "Contact form", recommended: true },
  { id: "testimonials", label: "Testimonials" },
];

export const WEBSITE_SETUP_STEPS: ClarificationQuestion[] = [
  {
    id: "purpose",
    type: "textarea",
    label: "What is the website for?",
    description: "Aerospace company, landscaping business, SaaS product, portfolio…",
    placeholder: "Reusable launch systems for satellite operators and research teams.",
    required: false,
    aiChoice: true,
  },
  {
    id: "goal",
    type: "textarea",
    label: "What should it say or accomplish?",
    description: "What you do, who it’s for, and the main action you want visitors to take.",
    placeholder:
      "Make us look serious and technically capable, and drive qualified contact inquiries.",
    required: false,
    aiChoice: true,
  },
  {
    id: "style",
    type: "visual_choice",
    label: "Style",
    description: "A directional preference — not a rigid template.",
    choices: STYLE_DIRECTIONS,
    required: false,
    aiChoice: true,
    allowCustom: true,
  },
  {
    id: "colors",
    type: "palette",
    label: "Colors",
    description: "Let Candor choose, pick light/dark, or enter brand colors (hex or names).",
    choices: COLOR_CHOICES,
    required: false,
    aiChoice: true,
    allowCustom: true,
  },
  {
    id: "imagery",
    type: "visual_choice",
    label: "How should Candor handle imagery?",
    choices: IMAGERY_CHOICES,
    required: false,
    aiChoice: true,
  },
  {
    id: "reference_url",
    type: "urls",
    label: "Have a website whose style you like?",
    description: "Optional. We borrow structure and feel — never copy content.",
    placeholder: "https://example.com",
    required: false,
    max: 1,
  },
];

export function isAiChoice(v: unknown): boolean {
  return v === AI_CHOICE_VALUE || v === "ai" || v === "ai_choice";
}

export function choiceLabel(list: ClarificationChoice[], id: unknown): string | null {
  if (typeof id !== "string") return null;
  return list.find((c) => c.id === id)?.label ?? id;
}

function paletteFromAnswer(v: unknown): PaletteAnswer | null {
  if (!v || typeof v !== "object") {
    if (typeof v === "string" && !isAiChoice(v)) {
      if (v === "light" || v === "dark") return { mode: v };
      if (v === "custom") return { custom: "" };
      return { preset: v, custom: v };
    }
    return null;
  }
  return v as PaletteAnswer;
}

export function describePalette(v: unknown): string | null {
  const p = paletteFromAnswer(v);
  if (!p) return null;
  if (p.custom?.trim()) return p.custom.trim();
  const preset = PALETTE_PRESETS.find((c) => c.id === p.preset);
  const parts: string[] = [];
  if (preset?.preview?.kind === "palette") {
    const pv = preset.preview;
    parts.push(
      `${preset.label}: primary ${pv.primary}, accent ${pv.accent}, background ${pv.background}, foreground ${pv.foreground}`,
    );
  }
  if (p.primary) parts.push(`primary ${p.primary}`);
  if (p.accent) parts.push(`accent ${p.accent}`);
  if (p.background) parts.push(`background ${p.background}`);
  if (p.foreground) parts.push(`foreground ${p.foreground}`);
  if (p.mode && p.mode !== "auto") parts.push(`${p.mode} mode`);
  return parts.length ? parts.join("; ") : null;
}

export function paletteTokens(v: unknown): Record<string, string> | null {
  const p = paletteFromAnswer(v);
  if (!p) return null;
  const out: Record<string, string> = {};
  const preset = PALETTE_PRESETS.find((c) => c.id === p.preset);
  if (preset?.preview?.kind === "palette") {
    out.primary = preset.preview.primary;
    out.accent = preset.preview.accent;
    out.background = preset.preview.background;
    out.foreground = preset.preview.foreground;
    out.mode = preset.preview.mode;
  }
  if (p.mode === "light") {
    out.mode = "light";
    out.background = out.background || "#ffffff";
    out.foreground = out.foreground || "#0f172a";
  }
  if (p.mode === "dark") {
    out.mode = "dark";
    out.background = out.background || "#0b1120";
    out.foreground = out.foreground || "#e2e8f0";
  }
  if (p.primary) out.primary = p.primary;
  if (p.accent) out.accent = p.accent;
  if (p.background) out.background = p.background;
  if (p.foreground) out.foreground = p.foreground;
  if (p.custom?.trim()) out.custom = p.custom.trim();
  return Object.keys(out).length ? out : null;
}

export function typographyTokens(v: unknown): { display?: string; body?: string } | null {
  const preset = TYPOGRAPHY_PRESETS.find((c) => c.id === v);
  if (!preset || preset.preview?.kind !== "type") return null;
  return {
    display: preset.preview.display.split(",")[0].replace(/'/g, ""),
    body: preset.preview.body.split(",")[0].replace(/'/g, ""),
  };
}

export function componentTokens(
  v: unknown,
): { radius?: string; shadow?: string; density?: string; buttons?: string; cards?: string } | null {
  const preset = COMPONENT_STYLES.find((c) => c.id === v);
  if (!preset || preset.preview?.kind !== "component") return null;
  const p = preset.preview;
  return {
    radius: p.radius,
    shadow: p.shadow === "none" ? "none" : "soft",
    density: p.density,
    buttons: p.button,
    cards: "shadowed",
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

export function imageryStrategyFromAnswer(v: unknown): ImageryStrategy {
  if (isAiChoice(v) || v == null || v === "") return "ai_choice";
  const id = typeof v === "string" ? v : String((v as { id?: string }).id || "");
  if (id === "generate" || id === "placeholder" || id === "user_upload" || id === "minimal") {
    return id;
  }
  return "ai_choice";
}

/**
 * Normalize any historical brief answers into the short onboarding shape.
 * Old projects keep working; new builds only see the short keys.
 */
export function normalizeSetupAnswersToShort(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };

  // purpose: keep; also fold legacy business_goal
  if (!answerFilled(out.purpose) && typeof raw.business_goal === "string") {
    out.purpose = raw.business_goal;
  }

  // goal: new field; fold audience_cta / anything_else / primary_cta
  if (!answerFilled(out.goal)) {
    const parts = [
      typeof raw.goal === "string" ? raw.goal : "",
      typeof raw.audience_cta === "string" ? raw.audience_cta : "",
      typeof raw.anything_else === "string" ? raw.anything_else : "",
      typeof raw.primary_cta === "string" && !isAiChoice(raw.primary_cta)
        ? `Primary CTA: ${choiceLabel(CTA_CHOICES, raw.primary_cta) ?? raw.primary_cta}`
        : "",
    ].filter((s) => s.trim());
    if (parts.length) out.goal = parts.join("\n").slice(0, 1200);
  }

  // style ← visual_direction / visual_style
  if (!answerFilled(out.style)) {
    if (typeof raw.visual_direction === "string") {
      out.style = mapLegacyStyle(raw.visual_direction);
    } else if (typeof raw.visual_style === "string") {
      out.style = mapLegacyStyle(raw.visual_style);
    }
  }

  // colors ← palette / brand_colors
  if (!answerFilled(out.colors)) {
    if (raw.palette !== undefined) out.colors = raw.palette;
    else if (typeof raw.brand_colors === "string") {
      out.colors = { custom: raw.brand_colors, mode: "auto" };
    }
  }

  // imagery default
  if (!answerFilled(out.imagery)) {
    out.imagery = AI_CHOICE_VALUE;
  }

  // reference_url ← inspiration_urls[0]
  if (!answerFilled(out.reference_url)) {
    const urls = urlsFromAnswer(raw.inspiration_urls ?? raw.reference_url);
    if (urls[0]) out.reference_url = urls[0];
  }

  return out;
}

function mapLegacyStyle(v: string): string {
  const s = v.toLowerCase();
  if (/minimal|clean/.test(s)) return "minimal";
  if (/bold/.test(s)) return "bold";
  if (/premium|dark.?premium|luxury|noir/.test(s)) return "premium";
  if (/editorial|magazine/.test(s)) return "editorial";
  if (/playful|fun|warm/.test(s)) return "playful";
  if (/tech|mono|saas|modern/.test(s)) return /tech|mono/.test(s) ? "technical" : "modern";
  if (STYLE_DIRECTIONS.some((c) => c.id === v)) return v;
  return v;
}

function answerFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Bridge to the legacy 8-key brief shape still read by older prompts/tools.
 */
export function legacyAnswersFromSteps(a: Record<string, unknown>): Record<string, unknown> {
  const short = normalizeSetupAnswersToShort(a);
  const ai = "Let Candor decide";
  const style = isAiChoice(short.style)
    ? ai
    : choiceLabel(STYLE_DIRECTIONS, short.style) ?? String(short.style || ai);
  const colors = isAiChoice(short.colors) ? ai : describePalette(short.colors) ?? ai;
  const purpose = typeof short.purpose === "string" ? short.purpose : "";
  const goal = typeof short.goal === "string" ? short.goal : "";
  return {
    business_goal: [purpose, goal].filter(Boolean).join(" — ") || ai,
    audience_cta: goal || ai,
    site_depth: "multi",
    visual_style: style,
    brand_colors: colors,
    layout_shape: [style],
    copy_tone: goal || ai,
    sections_features: ai,
  };
}
