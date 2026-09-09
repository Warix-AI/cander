/**
 * Feature flag for plan-first create pipeline.
 * Keep legacy `runWebsiteCreatePipeline` until Phase 7 default-on.
 */

export function isPlanFirstBuildEnabled(): boolean {
  const v =
    process.env.CANDER_BUILD_PLAN_FIRST?.trim() ||
    process.env.NEXT_PUBLIC_CANDER_BUILD_PLAN_FIRST?.trim() ||
    "";
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "on";
}
