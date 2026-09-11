import type {
  V2BehaviorTokens,
  V2ThemeTokens,
  V2ThemePresetId,
  V2BehaviorPresetId,
} from "./types.ts";

export const THEME_PRESETS: Record<
  V2ThemePresetId,
  { name: string; description: string; tokens: V2ThemeTokens }
> = {
  clean_minimal: {
    name: "Clean / Minimal",
    description: "Light surfaces, restrained type, generous whitespace.",
    tokens: {
      background: "#ffffff",
      foreground: "#0f172a",
      muted: "#f8fafc",
      mutedForeground: "#64748b",
      primary: "#0f172a",
      primaryForeground: "#ffffff",
      accent: "#e2e8f0",
      accentForeground: "#0f172a",
      border: "#e2e8f0",
      radius: "0.5rem",
      fontDisplay: "ui-sans-serif, system-ui, sans-serif",
      fontBody: "ui-sans-serif, system-ui, sans-serif",
      container: "72rem",
      sectionY: "5rem",
      density: "airy",
      shadow: "0 1px 2px rgb(15 23 42 / 0.06)",
    },
  },
  warm_editorial: {
    name: "Warm / Editorial",
    description: "Cream surfaces, warm accents, editorial hierarchy.",
    tokens: {
      background: "#f7f3eb",
      foreground: "#1c1917",
      muted: "#efe8dc",
      mutedForeground: "#78716c",
      primary: "#1c1917",
      primaryForeground: "#f7f3eb",
      accent: "#c4a574",
      accentForeground: "#1c1917",
      border: "#e7e0d4",
      radius: "0.25rem",
      fontDisplay: "Georgia, 'Times New Roman', serif",
      fontBody: "ui-sans-serif, system-ui, sans-serif",
      container: "68rem",
      sectionY: "5.5rem",
      density: "comfortable",
      shadow: "0 8px 24px rgb(28 25 23 / 0.08)",
    },
  },
  bold_modern: {
    name: "Bold / Modern",
    description: "High contrast, strong primary, compact density.",
    tokens: {
      background: "#0a0a0a",
      foreground: "#fafafa",
      muted: "#171717",
      mutedForeground: "#a3a3a3",
      primary: "#22c55e",
      primaryForeground: "#052e16",
      accent: "#262626",
      accentForeground: "#fafafa",
      border: "#262626",
      radius: "9999px",
      fontDisplay: "ui-sans-serif, system-ui, sans-serif",
      fontBody: "ui-sans-serif, system-ui, sans-serif",
      container: "80rem",
      sectionY: "4.5rem",
      density: "compact",
      shadow: "0 0 0 1px rgb(255 255 255 / 0.06)",
    },
  },
};

export const BEHAVIOR_PRESETS: Record<
  V2BehaviorPresetId,
  { name: string; description: string; tokens: V2BehaviorTokens }
> = {
  minimal_motion: {
    name: "Minimal motion",
    description: "Nearly static; accessibility-first.",
    tokens: {
      motion: "off",
      smoothScroll: false,
      hoverScale: false,
      menuTransition: "instant",
    },
  },
  subtle_motion: {
    name: "Subtle motion",
    description: "Light fades and soft hovers.",
    tokens: {
      motion: "subtle",
      smoothScroll: true,
      hoverScale: false,
      menuTransition: "fade",
    },
  },
  expressive_motion: {
    name: "Expressive motion",
    description: "Noticeable entrances and interactive feedback.",
    tokens: {
      motion: "expressive",
      smoothScroll: true,
      hoverScale: true,
      menuTransition: "slide",
    },
  },
};

/** Map user brand colors onto a theme preset without inventing CSS systems. */
export function applyBrandColorsToTheme(
  theme: V2ThemeTokens,
  brand: { primaryColor?: string; secondaryColor?: string; accentColor?: string },
): V2ThemeTokens {
  const next = { ...theme };
  if (brand.primaryColor?.trim()) {
    next.primary = brand.primaryColor.trim();
  }
  if (brand.secondaryColor?.trim()) {
    next.background = brand.secondaryColor.trim();
  }
  if (brand.accentColor?.trim()) {
    next.accent = brand.accentColor.trim();
  }
  return next;
}
