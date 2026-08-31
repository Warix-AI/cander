/**
 * PCC LanguageModel adapter — feature-flagged until Apple entitlement ships.
 * Uses the same LanguageModel surface as on-device; no silent third-party fallback.
 */

import { isPccEnabled } from "./flags.ts";

export type PccAvailability = {
  available: boolean;
  reason: string;
  message: string;
};

export type PccSessionProfile = "plan" | "execute" | "review";

export type PccReasoningLevel = "none" | "low" | "medium" | "high";

export type PccReasoningMatrix = Record<
  PccReasoningLevel,
  { maxTokens: number; temperature: number }
>;

export const DEFAULT_PCC_REASONING_MATRIX: PccReasoningMatrix = {
  none: { maxTokens: 512, temperature: 0.2 },
  low: { maxTokens: 1024, temperature: 0.25 },
  medium: { maxTokens: 2048, temperature: 0.3 },
  high: { maxTokens: 4096, temperature: 0.35 },
};

/**
 * Future: PrivateCloudComputeLanguageModel via Apple LanguageModel bridge.
 * Dynamic Profiles (plan/execute/review) stay within the Apple session only.
 */
export type PccLanguageModel = {
  id: "pcc";
  isAvailable: () => Promise<boolean>;
  generate: (opts: {
    prompt: string;
    instructions?: string;
    profile?: PccSessionProfile;
    reasoningLevel?: PccReasoningLevel;
  }) => Promise<{ content: string }>;
};

export async function getPccAvailability(): Promise<PccAvailability> {
  if (!isPccEnabled()) {
    return {
      available: false,
      reason: "feature_flag_off",
      message: "Private Cloud Compute is not enabled for this build.",
    };
  }
  // Future checks: OS support, Apple Intelligence enabled, region,
  // entitlement, daily allowance. Until then stay unavailable.
  return {
    available: false,
    reason: "entitlement_pending",
    message:
      "Private Cloud Compute requires a supported Apple setup. Continuing without it.",
  };
}

/** Stub LanguageModel — never returns available until entitlement lands. */
export function createPccLanguageModel(): PccLanguageModel {
  return {
    id: "pcc",
    async isAvailable() {
      const a = await getPccAvailability();
      return a.available;
    },
    async generate(opts) {
      const a = await getPccAvailability();
      throw new Error(
        a.message || "Private Cloud Compute is not available.",
      );
    },
  };
}
