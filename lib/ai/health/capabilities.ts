/**
 * Health capability gating — user-data intent vs general health knowledge.
 * Build-style: never unlock private health tools from space alone or general Qs.
 */

import { isHealthKitFlagEnabled } from "../../native/flags.ts";

/** First-person / possessive deixis for personal device health data. */
const USER_DATA_DEIXIS =
  /\b(my|i|i'?ve|i'?m|me|mine)\b[\s\S]{0,80}\b(steps?|step\s*count|workouts?|exercis(e|ed|ing)|active\s+energy|calories?\s+burned|resting\s+(heart\s+)?rate|heart\s+rate|hr|slept|sleep|sleeptime|how\s+many\s+steps)\b/i;

const USER_DATA_DEIXIS_REVERSE =
  /\b(steps?|workouts?|active\s+energy|resting\s+(heart\s+)?rate|sleep|slept)\b[\s\S]{0,48}\b(did\s+i|have\s+i|i\s+take|i\s+do|i\s+get|for\s+me|my)\b/i;

/** General health / knowledge — must NOT unlock HealthKit. */
const GENERAL_HEALTH =
  /\b(health\s+benefits?|benefits?\s+of\s+walking|what('?s| is)\s+a\s+healthy|recommended\s+(heart\s+rate|steps)|how\s+much\s+sleep\s+(should|do)\s+(people|adults)|is\s+walking\s+good)\b/i;

const COMPARE_ACTIVITY =
  /\b(compare|vs\.?|versus)\b[\s\S]{0,64}\b(my\s+)?(activity|steps?|workouts?|sleep|heart\s+rate)\b/i;

export type HealthCapabilityResolution = {
  requiresHealthCapabilities: boolean;
  reasons: string[];
};

export function isUserDataHealthIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (GENERAL_HEALTH.test(t) && !USER_DATA_DEIXIS.test(t)) return false;
  return USER_DATA_DEIXIS.test(t) || USER_DATA_DEIXIS_REVERSE.test(t);
}

export function isGeneralHealthQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isUserDataHealthIntent(t)) return false;
  return GENERAL_HEALTH.test(t);
}

export function resolveHealthCapabilities(opts: {
  content: string;
  /** Local connector pref — health tools exposed only when enabled. */
  healthEnabled?: boolean;
  platformSupportsHealthKit?: boolean;
}): HealthCapabilityResolution {
  const reasons: string[] = [];
  if (!isHealthKitFlagEnabled()) {
    return { requiresHealthCapabilities: false, reasons: ["flag_off"] };
  }
  if (opts.platformSupportsHealthKit === false) {
    return {
      requiresHealthCapabilities: false,
      reasons: ["unsupported_platform"],
    };
  }
  if (opts.healthEnabled === false) {
    return {
      requiresHealthCapabilities: false,
      reasons: ["local_pref_off"],
    };
  }

  const content = opts.content.trim();
  if (isGeneralHealthQuestion(content)) {
    return {
      requiresHealthCapabilities: false,
      reasons: ["general_health_knowledge"],
    };
  }

  if (isUserDataHealthIntent(content) || COMPARE_ACTIVITY.test(content)) {
    reasons.push("user_data_health_intent");
    return { requiresHealthCapabilities: true, reasons };
  }

  return {
    requiresHealthCapabilities: false,
    reasons: ["no_user_data_intent"],
  };
}
