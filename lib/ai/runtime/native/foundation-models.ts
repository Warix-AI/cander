"use client";

/**
 * JS bridge to native Apple Foundation Models.
 * - Capacitor iOS plugin (preferred on mobile)
 * - Electron desktop helper on macOS (optional binary)
 * Web browser: always unavailable (no fake local replies).
 *
 * PRIVACY: Calls stay on-device. Do not proxy these prompts to Edge.
 */

export type FoundationModelsAvailability = {
  available: boolean;
  reason: string;
  streaming: boolean;
  message: string;
};

type FoundationModelsNative = {
  getAvailability: () => Promise<Partial<FoundationModelsAvailability>>;
  generate: (opts: {
    prompt: string;
    instructions?: string;
  }) => Promise<{ content?: string }>;
};

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: <T>(name: string) => T;
  Plugins?: Record<string, FoundationModelsNative | undefined>;
};

type DesktopBridge = {
  foundationModels?: FoundationModelsNative;
};

let cachedPlugin: FoundationModelsNative | null | undefined;

function getCapacitor(): CapacitorBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
}

function getDesktopFoundationModels(): FoundationModelsNative | null {
  if (typeof window === "undefined") return null;
  const desk = (window as Window & { canderDesktop?: DesktopBridge })
    .canderDesktop;
  const fm = desk?.foundationModels;
  if (
    fm &&
    typeof fm.getAvailability === "function" &&
    typeof fm.generate === "function"
  ) {
    return fm;
  }
  return null;
}

/** True inside Capacitor native shell or Electron desktop with FM bridge. */
export function isNativeFoundationModelsHost() {
  const cap = getCapacitor();
  if (Boolean(cap?.isNativePlatform?.())) return true;
  return Boolean(getDesktopFoundationModels());
}

function getPlugin(): FoundationModelsNative | null {
  if (cachedPlugin !== undefined) return cachedPlugin;

  const cap = getCapacitor();
  if (cap?.isNativePlatform?.()) {
    const existing = cap.Plugins?.CanderFoundationModels;
    if (
      existing &&
      typeof existing.getAvailability === "function" &&
      typeof existing.generate === "function"
    ) {
      cachedPlugin = existing;
      return existing;
    }

    if (typeof cap.registerPlugin === "function") {
      try {
        const registered = cap.registerPlugin<FoundationModelsNative>(
          "CanderFoundationModels",
        );
        if (
          registered &&
          typeof registered.getAvailability === "function" &&
          typeof registered.generate === "function"
        ) {
          cachedPlugin = registered;
          return registered;
        }
      } catch {
        // fall through to desktop / unavailable
      }
    }
  }

  const desktop = getDesktopFoundationModels();
  if (desktop) {
    cachedPlugin = desktop;
    return desktop;
  }

  cachedPlugin = null;
  return null;
}

/** Clear cache after foreground / plugin reload. */
export function resetFoundationModelsPluginCache() {
  cachedPlugin = undefined;
}

export async function getFoundationModelsAvailability(): Promise<FoundationModelsAvailability> {
  const plugin = getPlugin();
  if (!plugin) {
    return {
      available: false,
      reason: isNativeFoundationModelsHost()
        ? "plugin_missing"
        : "web_or_no_plugin",
      streaming: false,
      message: isNativeFoundationModelsHost()
        ? "Native shell is running but the Foundation Models bridge is not ready."
        : "On-device AI runs in the Cander iOS app or Mac desktop helper on Apple Intelligence devices — not in the browser.",
    };
  }
  try {
    const result = await plugin.getAvailability();
    return {
      available: Boolean(result.available),
      reason: String(
        result.reason ?? (result.available ? "available" : "unavailable"),
      ),
      streaming: Boolean(result.streaming),
      message:
        String(result.message ?? "") ||
        (result.available
          ? "On-device model ready."
          : "On-device model unavailable."),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      reason: "plugin_error",
      streaming: false,
      message: `Could not reach the on-device AI bridge (${detail}).`,
    };
  }
}

export async function generateWithFoundationModels(
  prompt: string,
  instructions?: string,
): Promise<string> {
  const plugin = getPlugin();
  if (!plugin) {
    throw new Error("On-device Apple AI plugin is not available.");
  }
  const result = await plugin.generate({
    prompt,
    ...(instructions?.trim() ? { instructions: instructions.trim() } : {}),
  });
  const content = result.content?.trim();
  if (!content) throw new Error("On-device model returned an empty reply.");
  return content;
}
