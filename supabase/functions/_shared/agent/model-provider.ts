/**
 * ModelProvider — capability-aware, not name-leaky.
 * Phase 1: Ollama via Cander AI bridge only.
 */

import type {
  ModelCapabilities,
  ModelCompleteRequest,
  ModelCompleteResult,
} from "./types.ts";
import {
  assertVisionModelSelected,
  assertVisionProvider,
  logVisionRouting,
  prepareTurnVisionImages,
  VisionInputError,
} from "./vision-input.ts";
import { bridgeHttpFailureMessage } from "./bridge-errors.ts";

export interface ModelProvider {
  id: string;
  capabilities: ModelCapabilities;
  complete(req: ModelCompleteRequest): Promise<ModelCompleteResult>;
}

function isLocalOrPrivateUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return true;
    }
    if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    return false;
  } catch {
    return true;
  }
}

export function createOllamaBridgeProvider(opts?: {
  bridgeUrl?: string;
  bridgeSecret?: string;
  model?: string;
  visionModel?: string;
}): ModelProvider {
  const bridgeUrl = (opts?.bridgeUrl ?? Deno.env.get("CANDER_AI_BRIDGE_URL") ?? "")
    .replace(/\/$/, "");
  const bridgeSecret =
    opts?.bridgeSecret ?? Deno.env.get("CANDER_AI_BRIDGE_SECRET") ?? "";
  const textModel =
    opts?.model ?? Deno.env.get("OLLAMA_MODEL") ?? "llama3.2";
  const visionModel =
    opts?.visionModel ??
    Deno.env.get("OLLAMA_VISION_MODEL") ??
    "llama3.2-vision";
  const controllerModel =
    Deno.env.get("OLLAMA_CONTROLLER_MODEL") ?? textModel;
  const answerModel = Deno.env.get("OLLAMA_ANSWER_MODEL") ?? textModel;

  return {
    id: "ollama",
    capabilities: {
      structuredOutput: false,
      vision: true,
      streaming: false,
      maxContextTokens: 8192,
    },

    async complete(req: ModelCompleteRequest): Promise<ModelCompleteResult> {
      if (!bridgeUrl || !bridgeSecret) {
        throw new Error("AI bridge is not configured");
      }
      if (!bridgeUrl.startsWith("https://") || isLocalOrPrivateUrl(bridgeUrl)) {
        throw new Error(
          "CANDER_AI_BRIDGE_URL must be a public HTTPS tunnel hostname",
        );
      }

      const rawTurnImages = req.images ?? [];
      const prepared = rawTurnImages.length
        ? prepareTurnVisionImages(rawTurnImages)
        : { ok: true as const, images: [], meta: { imageCount: 0, mimes: [], byteSizes: [], visionRouting: false } };

      if (!prepared.ok) {
        throw new VisionInputError(prepared.code, prepared.error);
      }

      const turnImages = prepared.images;
      const hasImages = turnImages.length > 0;

      if (rawTurnImages.length > 0 && !hasImages) {
        throw new VisionInputError(
          "VISION_MISSING_BYTES",
          "Image bytes could not be validated for this turn.",
        );
      }

      assertVisionProvider({ vision: true }, hasImages);

      let modelId = hasImages ? visionModel : textModel;
      if (!hasImages) {
        if (req.purpose === "plan" || req.purpose === "sufficiency") {
          modelId = controllerModel;
        } else if (req.purpose === "answer") {
          modelId = answerModel;
        }
      }

      assertVisionModelSelected(hasImages, modelId, textModel);

      logVisionRouting({
        ...prepared.meta,
        selectedModel: modelId,
        visionRouting: hasImages,
      });

      const ollamaB64 = turnImages.map((img) => img.base64);

      const messages = req.messages.map((m) => {
        const row: { role: string; content: string; images?: string[] } = {
          role: m.role,
          content: m.content,
        };
        if (m.images?.length) {
          const embedded = prepareTurnVisionImages(m.images);
          if (embedded.ok && embedded.images.length) {
            row.images = embedded.images.map((img) => img.base64);
          }
        }
        return row;
      });

      if (hasImages) {
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        if (lastUser) {
          lastUser.images = ollamaB64;
        } else {
          messages.push({
            role: "user",
            content: req.messages.at(-1)?.content ?? "Describe the attached image(s).",
            images: ollamaB64,
          });
        }
      }

      const purposeHint =
        req.purpose === "plan"
          ? "Reply with compact JSON only."
          : req.purpose === "sufficiency"
            ? "Reply with JSON {\"sufficient\":boolean,\"reason\":string} only."
            : req.purpose === "rewrite"
              ? "Rewrite the search query only — one line, no quotes."
              : null;

      const bodyMessages = purposeHint
        ? [
            { role: "system", content: purposeHint },
            ...messages,
          ]
        : messages;

      const bridgeRes = await fetch(`${bridgeUrl}/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bridgeSecret}`,
        },
        body: JSON.stringify({ model: modelId, messages: bodyMessages }),
        signal: req.signal ?? AbortSignal.timeout(hasImages ? 90_000 : 45_000),
      });

      if (!bridgeRes.ok) {
        const detail = await bridgeRes.text().catch(() => "");
        throw new Error(bridgeHttpFailureMessage(bridgeRes.status, detail));
      }
      const data = (await bridgeRes.json()) as { content?: string };
      return {
        text: data.content?.trim() || "",
        modelId,
      };
    },
  };
}

/** Registry — real adapters only; no fake stubs. */
export function resolveModelProvider(
  inferenceProvider?: string | null,
): ModelProvider {
  const key = (
    inferenceProvider ??
    Deno.env.get("INFERENCE_PROVIDER") ??
    "ollama"
  )
    .trim()
    .toLowerCase();

  if (key === "ollama" || key === "bridge") {
    return createOllamaBridgeProvider();
  }

  throw new Error(
    `Inference provider "${key}" is not configured. Supported: ollama`,
  );
}

export { VisionInputError };
