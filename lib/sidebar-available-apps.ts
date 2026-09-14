/**
 * Apps eligible for the sidebar "More" discovery list — catalog minus
 * already-connected / already-listed pins. Reuses the same seed catalog as
 * the Apps directory (not a second hard-coded catalog).
 */

import { connectors } from "@/lib/data";
import { isConnectorComingSoon } from "@/lib/connectors/exclusive";
import { connectedConnectorIdsLive } from "@/lib/connector-connections-store";

/** Short labels matching sidebar pin titles. */
const SIDEBAR_APP_TITLE: Record<string, string> = {
  gmail: "Gmail",
  gcal: "Calendar",
  gdrive: "Drive",
  gsheets: "Sheets",
  gdocs: "Documents",
};

export type SidebarAvailableApp = {
  id: string;
  name: string;
  icon: string;
};

export function sidebarAppTitle(id: string, catalogName?: string) {
  return SIDEBAR_APP_TITLE[id] ?? catalogName ?? id;
}

/**
 * Public catalog apps the user can still connect from More.
 * Excludes connected apps, apps already in the main Apps pin list, and
 * Composio apps that are not OAuth-ready yet.
 */
export function listSidebarAvailableApps(opts: {
  workspaceId: string;
  /** Connector ids already shown in the main Apps pin list. */
  listedIds: Iterable<string>;
}): SidebarAvailableApp[] {
  const listed = new Set(opts.listedIds);
  const connected = new Set(connectedConnectorIdsLive(opts.workspaceId));

  return connectors
    .filter((item) => item.scope === "public")
    .filter((item) => !listed.has(item.id))
    .filter((item) => !connected.has(item.id))
    .filter((item) => !isConnectorComingSoon(item))
    .map((item) => ({
      id: item.id,
      name: sidebarAppTitle(item.id, item.name),
      icon: item.icon,
    }));
}
