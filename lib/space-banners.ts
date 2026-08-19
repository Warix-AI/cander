import type { PlatformNav, SpaceId } from "./types";

export type BannerKey = SpaceId | `plat-${PlatformNav}`;

export type BannerPresetId = "graphite" | "drift" | "depth" | "signal";

export type SpaceBannerChoice = {
  preset: BannerPresetId;
  custom: string | null;
};

export const BANNER_PRESETS: {
  id: BannerPresetId;
  label: string;
  className: string;
}[] = [
  { id: "graphite", label: "Graphite", className: "media-a" },
  { id: "drift", label: "Drift", className: "media-b" },
  { id: "depth", label: "Depth", className: "media-c" },
  { id: "signal", label: "Signal", className: "media-d" },
];

export const defaultBannerPreset: Record<BannerKey, BannerPresetId> = {
  work: "graphite",
  build: "graphite",
  studio: "drift",
  research: "depth",
  personal: "signal",
  connectors: "graphite",
  files: "drift",
  skills: "depth",
  scheduled: "signal",
  finances: "signal",
  health: "signal",
  "plat-overview": "graphite",
  "plat-hosting": "drift",
  "plat-models": "depth",
  "plat-api": "signal",
  "plat-keys": "graphite",
  "plat-deployments": "drift",
  "plat-logs": "depth",
  "plat-usage": "signal",
  "plat-docs": "graphite",
  "plat-recents": "graphite",
};

export function emptyBannerChoice(space: BannerKey): SpaceBannerChoice {
  return { preset: defaultBannerPreset[space] ?? "graphite", custom: null };
}

export function bannerClass(preset: BannerPresetId) {
  return (
    BANNER_PRESETS.find((item) => item.id === preset)?.className ?? "media-a"
  );
}

type Listener = () => void;

const listeners = new Set<Listener>();
let banners: Partial<Record<BannerKey, SpaceBannerChoice>> = {};
let hydrated = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function parseBanners(raw: string | null): Partial<Record<BannerKey, SpaceBannerChoice>> {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const next: Partial<Record<BannerKey, SpaceBannerChoice>> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!value || typeof value !== "object") continue;
      const row = value as { preset?: unknown; custom?: unknown };
      const preset = BANNER_PRESETS.some((item) => item.id === row.preset)
        ? (row.preset as BannerPresetId)
        : undefined;
      if (!preset) continue;
      next[key as BannerKey] = {
        preset,
        custom: typeof row.custom === "string" ? row.custom : null,
      };
    }
    return next;
  } catch {
    return {};
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  banners = parseBanners(window.localStorage.getItem("courier-space-banners"));
}

export function subscribeSpaceBanners(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSpaceBannersSnapshot() {
  return banners;
}

export function getSpaceBannersServerSnapshot(): Partial<
  Record<BannerKey, SpaceBannerChoice>
> {
  return {};
}

export function bannerFor(
  space: BannerKey,
  map: Partial<Record<BannerKey, SpaceBannerChoice>> = banners,
): SpaceBannerChoice {
  return map[space] ?? emptyBannerChoice(space);
}

export function persistSpaceBanner(space: BannerKey, next: SpaceBannerChoice) {
  hydrate();
  banners = { ...banners, [space]: next };
  window.localStorage.setItem("courier-space-banners", JSON.stringify(banners));
  emit();
}

export function setBannerPreset(space: BannerKey, preset: BannerPresetId) {
  persistSpaceBanner(space, { preset, custom: null });
}

export function setBannerCustom(space: BannerKey, custom: string) {
  hydrate();
  persistSpaceBanner(space, {
    preset: bannerFor(space).preset,
    custom,
  });
}
