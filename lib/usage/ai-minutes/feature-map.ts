import type { UsageFeatureCategory } from "../types.ts";
import type { AIUsageSource } from "./types.ts";

/** Map existing usage feature categories onto the universal AI source taxonomy. */
export function aiSourceForFeature(
  feature: UsageFeatureCategory,
): AIUsageSource {
  switch (feature) {
    case "ai_chat":
      return "chat";
    case "image_generation":
      return "image";
    case "audio_realtime":
      return "voice";
    case "web_research":
    case "knowledge_search":
      return "search";
    case "coding_agent":
      return "coding";
    case "sandbox_build":
      return "app_build";
    case "sandbox_runtime":
    case "sandbox_deploy":
      return "website_build";
    case "scheduled_reports":
    case "review_analysis":
      return "automation";
    case "knowledge_index":
      return "document";
    case "video_generation":
      return "other";
    default:
      return "other";
  }
}

/** Features that represent active AI work and should write the minutes ledger. */
export function isAiMeteredFeature(feature: UsageFeatureCategory): boolean {
  return (
    feature === "ai_chat" ||
    feature === "image_generation" ||
    feature === "audio_realtime" ||
    feature === "web_research" ||
    feature === "coding_agent" ||
    feature === "sandbox_build" ||
    feature === "sandbox_runtime" ||
    feature === "video_generation" ||
    feature === "review_analysis" ||
    feature === "scheduled_reports"
  );
}
