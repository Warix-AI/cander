"use client";

import { createAndroidLocalProvider } from "@/lib/ai/runtime/providers/android-local";
import { createAppleLocalProvider } from "@/lib/ai/runtime/providers/apple-local";
import { createCloudProvider } from "@/lib/ai/runtime/providers/cloud";
import { getAiRuntimeMode } from "@/lib/ai/runtime/mode-store";
import { getPccAvailability } from "@/lib/ai/intelligence/pcc";
import {
  AiRuntimeError,
  type AiGenerateRequest,
  type AiGenerateResult,
  type AiRuntimeCapabilities,
  type AiRuntimeMode,
  type AiRuntimeProvider,
} from "@/lib/ai/runtime/types";

let cloud: AiRuntimeProvider | null = null;
let apple: AiRuntimeProvider | null = null;
let android: AiRuntimeProvider | null = null;

function cloudProvider() {
  return (cloud ??= createCloudProvider());
}

function appleProvider() {
  return (apple ??= createAppleLocalProvider());
}

function androidProvider() {
  return (android ??= createAndroidLocalProvider());
}

async function pickLocalProvider(): Promise<AiRuntimeProvider | null> {
  const appleP = appleProvider();
  if (await appleP.isAvailable()) return appleP;
  const androidP = androidProvider();
  if (await androidP.isAvailable()) return androidP;
  return null;
}

/**
 * Resolve which provider handles a request.
 * Route-driven when preferredRoute is set; user mode remains a privacy override.
 * LOCAL never silently falls back to cloud (privacy).
 */
export async function resolveProvider(
  mode: AiRuntimeMode = getAiRuntimeMode(),
  preferredRoute?: AiGenerateRequest["preferredRoute"],
): Promise<AiRuntimeProvider> {
  if (mode === "local") {
    const local = await pickLocalProvider();
    if (!local) {
      throw new AiRuntimeError(
        "local_unavailable",
        "On-device AI is not available. Switch to Auto or Cloud — LOCAL will not send this request to the cloud.",
      );
    }
    return local;
  }

  if (mode === "cloud") return cloudProvider();

  // AUTO + classifier route
  if (preferredRoute === "cander_cloud") {
    return cloudProvider();
  }
  if (preferredRoute === "pcc") {
    const pcc = await getPccAvailability();
    if (pcc.available) {
      // PCC shares the Apple native bridge until a dedicated PCC session exists.
      const local = await pickLocalProvider();
      if (local) return local;
    }
    return cloudProvider();
  }

  // on_device or unset: prefer local when available
  const local = await pickLocalProvider();
  if (local) return local;
  return cloudProvider();
}

export async function getAiRuntimeCapabilities(
  mode: AiRuntimeMode = getAiRuntimeMode(),
): Promise<AiRuntimeCapabilities> {
  try {
    const provider = await resolveProvider(mode);
    return provider.getCapabilities();
  } catch (err) {
    if (err instanceof AiRuntimeError && err.code === "local_unavailable") {
      return {
        available: false,
        runtime: "unavailable",
        local: true,
        private: true,
        offline: true,
        streaming: false,
        tools: false,
        structuredOutput: false,
      };
    }
    throw err;
  }
}

export async function generateWithAiRuntime(
  request: AiGenerateRequest,
  mode: AiRuntimeMode = getAiRuntimeMode(),
): Promise<AiGenerateResult> {
  const provider = await resolveProvider(mode, request.preferredRoute);
  return provider.generate(request);
}
