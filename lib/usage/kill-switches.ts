import type { UsageFeatureCategory } from "./types.ts";

export type UsageKillSwitchState = Partial<Record<UsageFeatureCategory, boolean>> & {
  global?: boolean;
};

function readEnvFlag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Server-side kill switches — never trust client flags for spend protection. */
export function usageKillSwitchState(): UsageKillSwitchState {
  if (readEnvFlag("USAGE_KILL_SWITCH_GLOBAL")) {
    return { global: true };
  }
  return {
    ai_chat: readEnvFlag("USAGE_KILL_SWITCH_AI_CHAT"),
    knowledge_index: readEnvFlag("USAGE_KILL_SWITCH_KNOWLEDGE_INDEX"),
    knowledge_search: readEnvFlag("USAGE_KILL_SWITCH_KNOWLEDGE_SEARCH"),
    web_research: readEnvFlag("USAGE_KILL_SWITCH_WEB_RESEARCH"),
    review_analysis: readEnvFlag("USAGE_KILL_SWITCH_REVIEW_ANALYSIS"),
    scheduled_reports: readEnvFlag("USAGE_KILL_SWITCH_SCHEDULED_REPORTS"),
    image_generation: readEnvFlag("USAGE_KILL_SWITCH_IMAGE_GENERATION"),
    audio_realtime: readEnvFlag("USAGE_KILL_SWITCH_AUDIO"),
    coding_agent: readEnvFlag("USAGE_KILL_SWITCH_CODING_AGENT"),
    sandbox_runtime: readEnvFlag("USAGE_KILL_SWITCH_SANDBOX_RUNTIME"),
    sandbox_build: readEnvFlag("USAGE_KILL_SWITCH_SANDBOX_BUILD"),
    sandbox_deploy: readEnvFlag("USAGE_KILL_SWITCH_SANDBOX_DEPLOY"),
    video_generation: readEnvFlag("USAGE_KILL_SWITCH_VIDEO"),
  };
}

export function isFeatureKillSwitchActive(
  feature: UsageFeatureCategory,
  state: UsageKillSwitchState = usageKillSwitchState(),
): boolean {
  if (state.global) return true;
  return Boolean(state[feature]);
}

/** Global daily/monthly spend thresholds (micro-dollars). */
export function globalSpendCeilings() {
  return {
    dailyMicros: Number(process.env.USAGE_GLOBAL_DAILY_CEILING_MICROS ?? "100000000"),
    monthlyMicros: Number(process.env.USAGE_GLOBAL_MONTHLY_CEILING_MICROS ?? "1000000000"),
  };
}

export function isUsageEnforcementEnabled(): boolean {
  const raw = process.env.USAGE_ENFORCEMENT_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
}
