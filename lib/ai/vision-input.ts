/**
 * Vision input validation — turn-scoped image bytes for Ollama vision models.
 * Keep in sync with supabase/functions/_shared/agent/vision-input.ts
 */

export const SUPPORTED_VISION_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export type VisionImagePayload = {
  dataUrl: string;
  mime: string;
  byteSize: number;
  base64: string;
};

export type VisionLogMeta = {
  imageCount: number;
  mimes: string[];
  byteSizes: number[];
  visionRouting: boolean;
  selectedModel?: string;
};

export class VisionInputError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "VisionInputError";
    this.code = code;
  }
}

export function parseDataUrlMime(dataUrl: string): string | null {
  const m = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,/i);
  return m?.[1]?.toLowerCase() ?? null;
}

export function stripDataUrlPrefix(dataUrlOrBase64: string): string {
  const raw = (dataUrlOrBase64 || "").trim();
  const match = raw.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  return (match?.[1] ?? raw).replace(/\s/g, "");
}

export function estimateBase64Bytes(b64: string): number {
  const clean = b64.replace(/\s/g, "");
  if (!clean) return 0;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

export type PrepareTurnVisionResult =
  | { ok: true; images: VisionImagePayload[]; meta: VisionLogMeta }
  | { ok: false; code: string; error: string };

/**
 * Turn-scoped only — pass current-turn attachment URLs, never thread history.
 */
export function prepareTurnVisionImages(
  currentTurnUrls: string[],
  limit = 4,
): PrepareTurnVisionResult {
  const images: VisionImagePayload[] = [];
  const mimes: string[] = [];
  const byteSizes: number[] = [];

  for (const raw of currentTurnUrls.slice(0, limit)) {
    const trimmed = (raw || "").trim();
    if (!trimmed) continue;

    let dataUrl = trimmed;
    let mime = parseDataUrlMime(trimmed);

    if (!mime && /^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
      const b64 = stripDataUrlPrefix(trimmed);
      if (b64.length >= 32) {
        mime = "image/jpeg";
        dataUrl = `data:image/jpeg;base64,${b64}`;
      }
    }

    if (!mime || !dataUrl.startsWith("data:image/")) {
      return {
        ok: false,
        code: "VISION_INVALID_FORMAT",
        error: "Image must be a valid data-URL with base64 bytes — not a filename or remote URL.",
      };
    }

    if (!SUPPORTED_VISION_MIMES.has(mime)) {
      return {
        ok: false,
        code: "VISION_UNSUPPORTED_MIME",
        error: `Unsupported image type (${mime}). Use JPEG, PNG, GIF, or WebP.`,
      };
    }

    const base64 = stripDataUrlPrefix(dataUrl);
    if (base64.length < 32) {
      return {
        ok: false,
        code: "VISION_MISSING_BYTES",
        error: "Image bytes are missing or too small to send to the vision model.",
      };
    }

    const byteSize = estimateBase64Bytes(base64);
    if (byteSize < 24) {
      return {
        ok: false,
        code: "VISION_MISSING_BYTES",
        error: "Image could not be decoded — try retaking the photo or use JPEG/PNG.",
      };
    }

    images.push({ dataUrl, mime, byteSize, base64 });
    mimes.push(mime);
    byteSizes.push(byteSize);
  }

  if (currentTurnUrls.length > 0 && images.length === 0) {
    return {
      ok: false,
      code: "VISION_MISSING_BYTES",
      error: "Could not load image bytes for this turn. Retake the photo or attach a JPEG/PNG.",
    };
  }

  return {
    ok: true,
    images,
    meta: {
      imageCount: images.length,
      mimes,
      byteSizes,
      visionRouting: images.length > 0,
    },
  };
}

export function visionImagesToDataUrls(images: VisionImagePayload[]): string[] {
  return images.map((i) => i.dataUrl);
}

export function assertVisionProvider(
  capabilities: { vision?: boolean },
  hasImages: boolean,
): void {
  if (hasImages && !capabilities.vision) {
    throw new VisionInputError(
      "VISION_PROVIDER_UNAVAILABLE",
      "This turn includes images but the selected model provider does not support vision.",
    );
  }
}

export function assertVisionModelSelected(
  hasImages: boolean,
  selectedModel: string,
  textModel: string,
): void {
  if (!hasImages) return;
  if (selectedModel === textModel) {
    throw new VisionInputError(
      "VISION_TEXT_MODEL_BLOCKED",
      "Image turns must not use the text-only model.",
    );
  }
}

export function logVisionRouting(meta: VisionLogMeta & { selectedModel?: string }): void {
  console.log("[VISION_ROUTING]", {
    imageCount: meta.imageCount,
    mimes: meta.mimes,
    byteSizes: meta.byteSizes,
    visionRouting: meta.visionRouting,
    selectedModel: meta.selectedModel ?? null,
    succeeded: meta.visionRouting && Boolean(meta.selectedModel),
  });
}
