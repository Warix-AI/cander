/**
 * Feature flags for the in-sandbox V2 builder improvements.
 * Server resolves these into job config.json; the sandbox never reads env for flags.
 *
 * CANDER_BUILDER_IMPROVED=0 → legacy planner/coder path (A/B against improved).
 * Sub-flags default to matching the improved master when unset.
 */

function envOn(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (!v) return fallback;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  return fallback;
}

export type BuilderFeatureFlags = {
  /** Master switch for the improved builder workflow. */
  improved: boolean;
  /** Search AND fetch 21st components into the plan for create jobs. */
  twentyFirstFetch: boolean;
  /**
   * Website CREATE: search/fetch complete 21st templates first, then fill gaps
   * with components. Apps ignore this (component-first remains).
   */
  websiteTemplateFirst: boolean;
  /** AI visual QA after technical acceptance (create + visual edits). */
  visualQa: boolean;
  /** Bounded SDK-owned tool loop (no indefinite outer for-ever). */
  sdkOwnedLoop: boolean;
  /** Continue repair in-process with structured report instead of cold restart. */
  continuousRepair: boolean;
  /** Model routing (cheap/standard/strong) instead of always-coder. */
  modelRouting: boolean;
};

export function resolveBuilderFeatureFlags(): BuilderFeatureFlags {
  const improved = envOn("CANDER_BUILDER_IMPROVED", true);
  return {
    improved,
    twentyFirstFetch: envOn("CANDER_BUILDER_21ST_FETCH", improved),
    websiteTemplateFirst: envOn("CANDER_WEBSITE_21ST_TEMPLATE_FIRST", improved),
    visualQa: envOn("CANDER_BUILDER_VISUAL_QA", improved),
    sdkOwnedLoop: envOn("CANDER_BUILDER_SDK_LOOP", improved),
    continuousRepair: envOn("CANDER_BUILDER_CONTINUOUS_REPAIR", improved),
    modelRouting: envOn("CANDER_BUILDER_MODEL_ROUTING", improved),
  };
}
