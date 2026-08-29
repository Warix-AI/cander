"use client";

/**
 * JS bridge to native CanderFoundationModels Cap plugin.
 * Web: always unavailable (no fake local replies).
 */

export type FoundationModelsAvailability = {
  available: boolean;
  reason: string;
  streaming: boolean;
  message: string;
};

type FoundationModelsNative = {
  getAvailability: () => Promise<Partial<FoundationModelsAvailability>>;
  generate: (opts: { prompt: string }) => Promise<{ content?: string }>;
};

function getCapacitor(): {
  isNativePlatform?: () => boolean;
  registerPlugin?: (name: string) => FoundationModelsNative;
  Plugins?: { CanderFoundationModels?: FoundationModelsNative };
} | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: ReturnType<typeof getCapacitor> })
    .Capacitor;
}

function getPlugin(): FoundationModelsNative | null {
  const cap = getCapacitor();
  if (!cap?.isNativePlatform?.()) return null;
  if (cap.Plugins?.CanderFoundationModels) {
    return cap.Plugins.CanderFoundationModels;
  }
  if (typeof cap.registerPlugin === "function") {
    try {
      return cap.registerPlugin("CanderFoundationModels");
    } catch {
      return null;
    }
  }
  return null;
}

export async function getFoundationModelsAvailability(): Promise<FoundationModelsAvailability> {
  const plugin = getPlugin();
  if (!plugin) {
    return {
      available: false,
      reason: "web_or_no_plugin",
      streaming: false,
      message:
        "On-device AI runs in the Cander iOS app on Apple Intelligence devices — not in the browser.",
    };
  }
  try {
    const result = await plugin.getAvailability();
    return {
      available: Boolean(result.available),
      reason: String(result.reason ?? (result.available ? "available" : "unavailable")),
      streaming: Boolean(result.streaming),
      message:
        String(result.message ?? "") ||
        (result.available
          ? "On-device model ready."
          : "On-device model unavailable."),
    };
  } catch {
    return {
      available: false,
      reason: "plugin_error",
      streaming: false,
      message: "Could not reach the on-device AI bridge.",
    };
  }
}

export async function generateWithFoundationModels(
  prompt: string,
): Promise<string> {
  const plugin = getPlugin();
  if (!plugin) {
    throw new Error("On-device Apple AI plugin is not available.");
  }
  const result = await plugin.generate({ prompt });
  const content = result.content?.trim();
  if (!content) throw new Error("On-device model returned an empty reply.");
  return content;
}
