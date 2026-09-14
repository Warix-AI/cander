/**
 * Keep sidebar Apps in sync with live connections — pins alone can lag after
 * sign-in until prefs hydrate or a refresh.
 */

import { connectedConnectorIdsLive } from "@/lib/connector-connections-store";
import { pinTierOf, setStoredPin } from "@/lib/session";

/** Pin any actively connected app that is missing from the sidebar Apps list. */
export function ensureConnectedAppsPinned(workspaceId: string) {
  if (!workspaceId) return;
  for (const connectorId of connectedConnectorIdsLive(workspaceId)) {
    if (pinTierOf("connector", connectorId)) continue;
    setStoredPin("connector", connectorId, "primary");
  }
}
