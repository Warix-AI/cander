import type { BannerKey } from "./space-banners";
import type { DiscoveryItem } from "./discovery-types";
import type { PlatformNav, SpaceId } from "./types";

const SPACE_IDS = new Set<string>([
  "work",
  "build",
  "studio",
  "research",
  "personal",
  "connectors",
  "files",
  "skills",
  "scheduled",
  "finances",
  "health",
]);

/** Which space banner wash to use for a discovery card, if any. */
export function discoveryBannerKey(item: DiscoveryItem): BannerKey | null {
  if (item.requiredSpace) return item.requiredSpace;

  if (item.cta.kind === "openSpace" && item.cta.target && SPACE_IDS.has(item.cta.target)) {
    return item.cta.target as SpaceId;
  }
  if (item.cta.kind === "openConnector") return "connectors";
  if (item.cta.kind === "openPlatform" && item.cta.target) {
    return `plat-${item.cta.target as PlatformNav}`;
  }
  if (item.category === "connector") return "connectors";
  if (item.category === "hosting" || item.category === "development") {
    return "plat-hosting";
  }
  return null;
}
