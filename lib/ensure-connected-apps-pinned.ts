/**
 * Keep sidebar Apps in sync with live connections — pins alone can lag after
 * sign-in until prefs hydrate or a refresh.
 */

import { compareConnectorCatalogOrder } from "@/lib/api/connector-catalog";
import { connectedConnectorIdsLive } from "@/lib/connector-connections-store";
import {
  getPinsSnapshot,
  persistPins,
  pinTierOf,
} from "@/lib/session";

/**
 * Pin any actively connected app missing from the sidebar Apps list.
 * Appends in catalog order — never prepends — so mobile/desktop/web keep the
 * same pin order (setStoredPin would reverse batch order).
 */
export function ensureConnectedAppsPinned(workspaceId: string) {
  if (!workspaceId) return;
  const missing = connectedConnectorIdsLive(workspaceId)
    .filter((id) => !pinTierOf("connector", id))
    .sort(compareConnectorCatalogOrder);
  if (!missing.length) return;

  const current = getPinsSnapshot();
  persistPins([
    ...current,
    ...missing.map((id) => ({
      kind: "connector" as const,
      id,
      tier: "primary" as const,
    })),
  ]);
  void import("@/lib/pin-display-prefs").then((mod) => {
    mod.ensurePinKindVisible("connector");
  });
}
