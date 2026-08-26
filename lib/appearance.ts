import { useSyncExternalStore } from "react";
import { persistTheme } from "@/lib/session";
import { setShellStyle, type ShellStyle } from "@/lib/shell-chrome";

export type ColorModeId = "light" | "dark";

export const COLOR_MODE_PRESETS: {
  id: ColorModeId;
  label: string;
}[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export function colorPaletteForMode(id: ColorModeId): ColorPalette {
  switch (id) {
    case "light":
      return {
        theme: "light",
        chroma: 0,
        accentChroma: 0.04,
        hue: 260,
        label: "Light",
      };
    case "dark":
      return {
        theme: "dark",
        chroma: 0,
        accentChroma: 0.05,
        hue: 260,
        label: "Dark",
      };
  }
}

/** Preview swatch — matches applied CSS vars closely. */
export function swatchForMode(id: ColorModeId): string {
  switch (id) {
    case "light":
      return "oklch(0.97 0.004 260)";
    case "dark":
      return "oklch(0.21 0.006 260)";
  }
}

function isColorModeId(value: unknown): value is ColorModeId {
  return COLOR_MODE_PRESETS.some((preset) => preset.id === value);
}

function migrateColorMode(value: unknown): ColorModeId {
  if (value === "dark" || value === "dark-charcoal" || value === "dark-blue") {
    return "dark";
  }
  if (value === "light" || value === "light-blue") {
    return "light";
  }
  return DEFAULT_APPEARANCE.colorMode;
}

function migrateLegacyColor(color: number): ColorModeId {
  return clamp(color) < 45 ? "light" : "dark";
}

export function setColorMode(id: ColorModeId) {
  setAppearance({ colorMode: id });
}

export function setLayoutMode(mode: ShellStyle) {
  setAppearance({ layout: mode === "floating" ? 100 : 0 });
}

export function layoutModeFor(value: number): ShellStyle {
  return clamp(value) >= 50 ? "floating" : "classic";
}

export type AppearanceState = {
  colorMode: ColorModeId;
  /** Type continuum: size + many family stops. */
  typography: number;
  /** 0 dense → 100 comfortable. */
  spacing: number;
  /** 0 sharp → 100 soft radii. */
  shapes: number;
  /** 0 off → 50 normal → 100 snappy. */
  motion: number;
  /** 0 classic → 100 floating (snaps). */
  layout: number;
};

export type ColorPalette = {
  theme: "light" | "dark";
  /** 0 = monochrome, higher = more tint / accent chroma. */
  chroma: number;
  /** Chart / accent chroma — kept separate so surfaces stay mellow. */
  accentChroma: number;
  hue: number;
  label: string;
};

export type TypePreset = {
  fontSans: string;
  fontSize: string;
  letterSpacing: string;
  label: string;
};

type Listener = () => void;

const STORAGE_KEY = "courier-appearance-v2";
const listeners = new Set<Listener>();

/**
 * Brand defaults: light + floating layout.
 * Color continuum: left = light, center (~50) = mono dark, right = dark tints.
 * Typography 50 = DM Sans.
 */
export const DEFAULT_APPEARANCE: AppearanceState = {
  colorMode: "light",
  typography: 50,
  spacing: 50,
  shapes: 50,
  motion: 50,
  layout: 100,
};

const SERVER_SNAPSHOT: AppearanceState = { ...DEFAULT_APPEARANCE };

let state: AppearanceState = { ...DEFAULT_APPEARANCE };
let hydrated = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function clamp(value: number) {
  if (Number.isNaN(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function parse(raw: string | null): AppearanceState {
  if (!raw) return { ...DEFAULT_APPEARANCE };
  try {
    const data = JSON.parse(raw) as Partial<AppearanceState> & { color?: number };
    const colorMode =
      data.colorMode !== undefined
        ? migrateColorMode(data.colorMode)
        : typeof data.color === "number"
          ? migrateLegacyColor(data.color)
          : DEFAULT_APPEARANCE.colorMode;
    return {
      colorMode,
      typography: clamp(
        typeof data.typography === "number"
          ? data.typography
          : DEFAULT_APPEARANCE.typography,
      ),
      spacing: clamp(
        typeof data.spacing === "number" ? data.spacing : DEFAULT_APPEARANCE.spacing,
      ),
      shapes: clamp(
        typeof data.shapes === "number" ? data.shapes : DEFAULT_APPEARANCE.shapes,
      ),
      motion: clamp(
        typeof data.motion === "number" ? data.motion : DEFAULT_APPEARANCE.motion,
      ),
      layout: clamp(
        typeof data.layout === "number" ? data.layout : DEFAULT_APPEARANCE.layout,
      ),
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  state = parse(window.localStorage.getItem(STORAGE_KEY));
}

function persist(next: AppearanceState) {
  state = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  emit();
}

/**
 * Color continuum (0–100). Default (~8) = mono light.
 * Left = mellow lights · Center (50) = mono dark · Right = mellow dark tints.
 */
export function colorPaletteFor(value: number): ColorPalette {
  const v = clamp(value);

  // Center band — mono dark.
  if (v >= 45 && v <= 55) {
    return {
      theme: "dark",
      chroma: 0,
      accentChroma: 0.05,
      hue: 260,
      label: "Mono dark",
    };
  }

  if (v < 45) {
    if (v < 9) {
      return {
        theme: "light",
        chroma: 0,
        accentChroma: 0.04,
        hue: 260,
        label: "Mono light",
      };
    }
    if (v < 18) {
      return {
        theme: "light",
        chroma: 0.014,
        accentChroma: 0.09,
        hue: 255,
        label: "Light · Blue",
      };
    }
    if (v < 27) {
      return {
        theme: "light",
        chroma: 0.015,
        accentChroma: 0.09,
        hue: 155,
        label: "Light · Green",
      };
    }
    if (v < 36) {
      return {
        theme: "light",
        chroma: 0.016,
        accentChroma: 0.095,
        hue: 350,
        label: "Light · Pink",
      };
    }
    return {
      theme: "light",
      chroma: 0.015,
      accentChroma: 0.09,
      hue: 295,
      label: "Light · Purple",
    };
  }

  // Right of center — dark tinted variants (mellow), including Graphite
  if (v < 64) {
    return {
      theme: "dark",
      chroma: 0.018,
      accentChroma: 0.19,
      hue: 260,
      label: "Dark · Graphite",
    };
  }
  if (v < 74) {
    return {
      theme: "dark",
      chroma: 0.022,
      accentChroma: 0.1,
      hue: 230,
      label: "Dark · Blue",
    };
  }
  if (v < 84) {
    return {
      theme: "dark",
      chroma: 0.02,
      accentChroma: 0.095,
      hue: 160,
      label: "Dark · Green",
    };
  }
  if (v < 92) {
    return {
      theme: "dark",
      chroma: 0.022,
      accentChroma: 0.1,
      hue: 300,
      label: "Dark · Purple",
    };
  }
  return {
    theme: "dark",
    chroma: 0.02,
    accentChroma: 0.095,
    hue: 350,
    label: "Dark · Pink",
  };
}

/**
 * Typography continuum — DM Sans (original) at center (50).
 */
export function typePresetFor(value: number): TypePreset {
  const v = clamp(value);
  const sizeInBand = (start: number, end: number, minPx: number, maxPx: number) => {
    const t = (v - start) / Math.max(1, end - start);
    return `${(minPx + Math.min(1, Math.max(0, t)) * (maxPx - minPx)).toFixed(2)}px`;
  };

  if (v < 14) {
    return {
      label: "DM Sans · compact",
      fontSans: "var(--font-dm-sans), ui-sans-serif, sans-serif, system-ui",
      fontSize: sizeInBand(0, 14, 12.5, 13.75),
      letterSpacing: "0.006em",
    };
  }
  if (v < 28) {
    return {
      label: "Inter",
      fontSans: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
      fontSize: sizeInBand(14, 28, 13.25, 14.75),
      letterSpacing: "-0.011em",
    };
  }
  if (v < 42) {
    return {
      label: "Space Grotesk",
      fontSans: "var(--font-space-grotesk), ui-sans-serif, sans-serif",
      fontSize: sizeInBand(28, 42, 13.5, 15),
      letterSpacing: "-0.02em",
    };
  }
  // Center band — original Courier type
  if (v < 58) {
    return {
      label: "DM Sans",
      fontSans: "var(--font-dm-sans), ui-sans-serif, sans-serif, system-ui",
      fontSize: "14.50px",
      letterSpacing: "0.008em",
    };
  }
  if (v < 70) {
    return {
      label: "IBM Plex Sans",
      fontSans: "var(--font-ibm-plex), ui-sans-serif, sans-serif",
      fontSize: sizeInBand(58, 70, 14, 15.5),
      letterSpacing: "-0.006em",
    };
  }
  if (v < 80) {
    return {
      label: "Source Serif",
      fontSans: "var(--font-source-serif), ui-serif, Georgia, serif",
      fontSize: sizeInBand(70, 80, 14.25, 16),
      letterSpacing: "0.01em",
    };
  }
  if (v < 90) {
    return {
      label: "Geist Mono",
      fontSans: "var(--font-geist-mono), ui-monospace, monospace",
      fontSize: sizeInBand(80, 90, 13.25, 14.75),
      letterSpacing: "0",
    };
  }
  return {
    label: "Newsreader",
    fontSans: "var(--font-newsreader), ui-serif, Georgia, Cambria, serif",
    fontSize: sizeInBand(90, 100, 15, 17.5),
    letterSpacing: "-0.01em",
  };
}

/** Sync theme + shell chrome so existing hooks keep working. */
export function syncAppearanceSideEffects(next: AppearanceState = getAppearanceSnapshot()) {
  if (typeof window === "undefined") return;
  const palette = colorPaletteForMode(next.colorMode);
  const current: "light" | "dark" = document.documentElement.classList.contains(
    "dark",
  )
    ? "dark"
    : "light";
  if (palette.theme !== current) {
    persistTheme(palette.theme);
  } else {
    // Still refresh color-scheme / keyboard when already in sync.
    persistTheme(palette.theme);
  }
  const shell: ShellStyle = next.layout >= 50 ? "floating" : "classic";
  setShellStyle(shell);
}

export function subscribeAppearance(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAppearanceSnapshot(): AppearanceState {
  hydrate();
  return state;
}

export function getAppearanceServerSnapshot(): AppearanceState {
  return SERVER_SNAPSHOT;
}

export function setAppearance(partial: Partial<AppearanceState>) {
  hydrate();
  const colorMode =
    partial.colorMode !== undefined && isColorModeId(partial.colorMode)
      ? partial.colorMode
      : state.colorMode;
  const next: AppearanceState = {
    colorMode,
    typography: clamp(partial.typography ?? state.typography),
    spacing: clamp(partial.spacing ?? state.spacing),
    shapes: clamp(partial.shapes ?? state.shapes),
    motion: clamp(partial.motion ?? state.motion),
    layout:
      partial.layout === undefined
        ? state.layout
        : partial.layout >= 50
          ? 100
          : 0,
  };
  persist(next);
  syncAppearanceSideEffects(next);
}

export function setAppearanceAxis(key: keyof AppearanceState, value: number) {
  setAppearance({ [key]: value });
}

export function resetAppearance() {
  hydrate();
  persist({ ...DEFAULT_APPEARANCE });
  syncAppearanceSideEffects(DEFAULT_APPEARANCE);
}

export function useAppearance() {
  return useSyncExternalStore(
    subscribeAppearance,
    getAppearanceSnapshot,
    getAppearanceServerSnapshot,
  );
}

/** Derived CSS values for the applicator. */
export function appearanceToCss(a: AppearanceState) {
  const palette = colorPaletteForMode(a.colorMode);
  const type = typePresetFor(a.typography);

  const density = 0.85 + (a.spacing / 100) * 0.35;
  const radius = `${Math.round(4 + (a.shapes / 100) * 14)}px`;

  let motion = 1;
  let motionMode: "off" | "calm" | "normal" | "snappy" = "normal";
  if (a.motion <= 8) {
    motion = 0;
    motionMode = "off";
  } else if (a.motion < 50) {
    motion = 0.55 + (a.motion / 50) * 0.45;
    motionMode = "calm";
  } else if (a.motion === 50) {
    motion = 1;
    motionMode = "normal";
  } else {
    motion = 1 + ((a.motion - 50) / 50) * 0.55;
    motionMode = "snappy";
  }

  const accentChroma = palette.accentChroma;

  return {
    fontSize: type.fontSize,
    fontSans: type.fontSans,
    letterSpacing: type.letterSpacing,
    typeLabel: type.label,
    density: density.toFixed(3),
    radius,
    motion: String(motion),
    motionMode,
    theme: palette.theme,
    chroma: String(palette.chroma),
    accentChroma: String(accentChroma),
    hue: String(palette.hue),
    colorLabel: palette.label,
    shell: (a.layout >= 50 ? "floating" : "classic") as ShellStyle,
  };
}
