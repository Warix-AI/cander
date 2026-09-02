import {
  BANNER_PRESETS,
  bannerClass,
  type BannerPresetId,
} from "@/lib/space-banners";

export type ProjectCoverMode =
  | "first-tab"
  | "gradient"
  | "upload"
  | "generated-first";

const GRADIENT_PREFIX = "gradient:";
export const GENERATED_FIRST_COVER = "generated-first";

export function isBannerPresetId(value: string): value is BannerPresetId {
  return BANNER_PRESETS.some((item) => item.id === value);
}

export function encodeGradientCover(preset: BannerPresetId): string {
  return `${GRADIENT_PREFIX}${preset}`;
}

export function parseProjectCover(cover: string | undefined | null): {
  mode: ProjectCoverMode;
  gradient?: BannerPresetId;
  imageUrl?: string;
} {
  if (!cover) return { mode: "first-tab" };
  if (cover === GENERATED_FIRST_COVER) return { mode: "generated-first" };
  if (cover.startsWith(GRADIENT_PREFIX)) {
    const id = cover.slice(GRADIENT_PREFIX.length);
    if (isBannerPresetId(id)) return { mode: "gradient", gradient: id };
    return { mode: "first-tab" };
  }
  return { mode: "upload", imageUrl: cover };
}

export function projectCoverImageSrc(cover: string | undefined | null): string | undefined {
  const parsed = parseProjectCover(cover);
  if (parsed.mode === "upload") return parsed.imageUrl;
  return undefined;
}

export function projectCoverGradientClass(
  cover: string | undefined | null,
): string | undefined {
  const parsed = parseProjectCover(cover);
  if (parsed.mode === "gradient" && parsed.gradient) {
    return bannerClass(parsed.gradient);
  }
  return undefined;
}

export function coverValueForCreate(input: {
  mode: ProjectCoverMode;
  gradient?: BannerPresetId;
  uploadDataUrl?: string | null;
}): string | undefined {
  if (input.mode === "generated-first") return GENERATED_FIRST_COVER;
  if (input.mode === "gradient" && input.gradient) {
    return encodeGradientCover(input.gradient);
  }
  if (input.mode === "upload" && input.uploadDataUrl) {
    return input.uploadDataUrl;
  }
  return undefined;
}

/** Studio cards waiting for the first generated image (or still on default live-tab). */
export function studioCoverAcceptsFirstGenerated(
  cover: string | undefined | null,
): boolean {
  const parsed = parseProjectCover(cover);
  if (parsed.mode === "gradient" || parsed.mode === "upload") return false;
  return true;
}
