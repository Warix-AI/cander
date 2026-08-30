/**
 * Named budget profiles — Apple ~4k is the initial on_device_small value,
 * not a permanent architectural constant.
 */

import type { BudgetProfileName, TurnBudgets } from "./types.ts";

const PROFILES: Record<BudgetProfileName, TurnBudgets> = {
  on_device_small: {
    profile: "on_device_small",
    contextTokens: 4096,
    maxToolRounds: 2,
    concurrency: 3,
    toolTimeoutMs: 12_000,
    earlySynthesizeWhenSufficient: true,
    maxPromptChars: 14_000,
  },
  on_device_large: {
    profile: "on_device_large",
    contextTokens: 8192,
    maxToolRounds: 2,
    concurrency: 4,
    toolTimeoutMs: 15_000,
    earlySynthesizeWhenSufficient: true,
    maxPromptChars: 28_000,
  },
  pcc: {
    profile: "pcc",
    contextTokens: 32_000,
    maxToolRounds: 3,
    concurrency: 6,
    toolTimeoutMs: 20_000,
    earlySynthesizeWhenSufficient: true,
    maxPromptChars: 96_000,
  },
};

export function budgetsForProfile(
  name: BudgetProfileName = "on_device_small",
): TurnBudgets {
  return { ...PROFILES[name] };
}

/** Rough char≈token heuristic for clipping (4 chars/token). */
export function charsForTokenBudget(tokens: number): number {
  return Math.max(512, Math.floor(tokens * 4 * 0.85));
}
