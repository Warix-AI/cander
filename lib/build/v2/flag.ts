/**
 * Feature flag for Website Builder V2 (config-driven).
 * Default OFF — existing V1 create path unchanged until explicitly enabled.
 */

export function isWebsiteBuilderV2Enabled(): boolean {
  const v = process.env.CANDER_WEBSITE_BUILDER_V2?.trim().toLowerCase();
  if (!v) return false;
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/** Client-safe public mirror (optional). Server flag remains authoritative. */
export function isWebsiteBuilderV2EnabledPublic(): boolean {
  const v = process.env.NEXT_PUBLIC_CANDER_WEBSITE_BUILDER_V2?.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  return isWebsiteBuilderV2Enabled();
}
