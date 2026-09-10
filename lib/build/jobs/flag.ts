/**
 * Website Builder V2 flag.
 * Create/edit turns run in the browser, so set BOTH:
 *   CANDER_BUILD_V2=1
 *   NEXT_PUBLIC_CANDER_BUILD_V2=1
 * V2 = builder agent runs inside the project sandbox as a long-lived job.
 */
export function isBuildV2Enabled(): boolean {
  const v =
    process.env.CANDER_BUILD_V2?.trim() ||
    process.env.NEXT_PUBLIC_CANDER_BUILD_V2?.trim() ||
    "";
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "on";
}
