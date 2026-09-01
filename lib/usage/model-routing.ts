/**
 * Server-side model routing — Codex/coding-agent readiness without customer UI.
 * Model identifiers stay in env/config only.
 */

import { isFeatureKillSwitchActive } from "./kill-switches.ts";

export type ModelCapability =
  | "general_chat"
  | "knowledge_answer"
  | "web_research"
  | "image_generation"
  | "coding_agent";

export type ModelRouteDecision = {
  capability: ModelCapability;
  provider: "openai" | "local" | "cloud";
  model: string;
  enabled: boolean;
  reason?: string;
};

function env(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export function isCodingAgentFeatureEnabled(): boolean {
  const raw = process.env.CODING_AGENT_ENABLED?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  return false;
}

export function resolveModelRoute(capability: ModelCapability): ModelRouteDecision {
  switch (capability) {
    case "coding_agent": {
      const enabled =
        isCodingAgentFeatureEnabled() &&
        !isFeatureKillSwitchActive("coding_agent");
      return {
        capability,
        provider: "openai",
        model: env("CODING_AGENT_MODEL", env("OPENAI_CODING_MODEL", "gpt-5.3-codex")),
        enabled,
        reason: enabled
          ? undefined
          : "Coding agent capability is disabled by feature flag.",
      };
    }
    case "image_generation":
      return {
        capability,
        provider: "openai",
        model: env("OPENAI_IMAGE_MODEL", "gpt-image-1.5"),
        enabled: !isFeatureKillSwitchActive("image_generation"),
      };
    case "web_research":
      return {
        capability,
        provider: "openai",
        model: env("OPENAI_WEB_MODEL", env("OPENAI_MODEL", "gpt-4.1-mini")),
        enabled: !isFeatureKillSwitchActive("web_research"),
      };
    case "knowledge_answer":
      return {
        capability,
        provider: "openai",
        model: env("OPENAI_KNOWLEDGE_MODEL", env("OPENAI_MODEL", "gpt-4.1-mini")),
        enabled: true,
      };
    case "general_chat":
    default:
      return {
        capability: "general_chat",
        provider: "openai",
        model: env("OPENAI_MODEL", "gpt-4.1-mini"),
        enabled: !isFeatureKillSwitchActive("ai_chat"),
      };
  }
}

/** Map usage feature categories to model capabilities (never route chat to Codex). */
export function capabilityForUsageFeature(
  feature: import("./types").UsageFeatureCategory,
): ModelCapability | null {
  switch (feature) {
    case "ai_chat":
      return "general_chat";
    case "knowledge_search":
      return "knowledge_answer";
    case "web_research":
      return "web_research";
    case "image_generation":
      return "image_generation";
    case "coding_agent":
    case "sandbox_build":
    case "sandbox_runtime":
    case "sandbox_deploy":
      return "coding_agent";
    default:
      return null;
  }
}
