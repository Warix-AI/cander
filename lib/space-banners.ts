import type { SpaceId } from "./types";

export type BannerKey = SpaceId;

export type BannerPresetId = "host" | "price" | "spaces" | "dusk";

export type SpaceBannerChoice = {
  preset: BannerPresetId;
  custom: string | null;
};

/** Maps legacy Graphite preset ids stored in localStorage. */
const LEGACY_PRESET: Record<string, BannerPresetId> = {
  graphite: "host",
  drift: "price",
  depth: "spaces",
  signal: "dusk",
  host: "host",
  price: "price",
  spaces: "spaces",
  dusk: "dusk",
};

export const BANNER_PRESETS: {
  id: BannerPresetId;
  label: string;
  className: string;
}[] = [
  { id: "host", label: "Ember", className: "panel-wash-host" },
  { id: "price", label: "Indigo", className: "panel-wash-price" },
  { id: "spaces", label: "Aurora", className: "panel-wash-spaces" },
  { id: "dusk", label: "Dusk", className: "panel-wash-dusk" },
];

export const defaultBannerPreset: Record<BannerKey, BannerPresetId> = {
  home: "dusk",
  work: "price",
  build: "spaces",
  research: "host",
  studio: "spaces",
};

export function emptyBannerChoice(space: BannerKey): SpaceBannerChoice {
  return { preset: defaultBannerPreset[space] ?? "price", custom: null };
}

export function bannerClass(preset: BannerPresetId) {
  return (
    BANNER_PRESETS.find((item) => item.id === preset)?.className ??
    "panel-wash-price"
  );
}

type Listener = () => void;

const listeners = new Set<Listener>();
let banners: Partial<Record<BannerKey, SpaceBannerChoice>> = {};
let hydrated = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function resolvePreset(value: unknown): BannerPresetId | undefined {
  if (typeof value !== "string") return undefined;
  return LEGACY_PRESET[value];
}

function parseBanners(raw: string | null): Partial<Record<BannerKey, SpaceBannerChoice>> {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const next: Partial<Record<BannerKey, SpaceBannerChoice>> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!value || typeof value !== "object") continue;
      const row = value as { preset?: unknown; custom?: unknown };
      const preset = resolvePreset(row.preset);
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

const EMPTY_BANNERS: Partial<Record<BannerKey, SpaceBannerChoice>> = {};

export function getSpaceBannersServerSnapshot(): Partial<
  Record<BannerKey, SpaceBannerChoice>
> {
  return EMPTY_BANNERS;
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
