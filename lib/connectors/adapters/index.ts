/**
 * Adapter registry — resolve connector adapters by connectorId.
 */

import type { ConnectorAdapter } from "./types.ts";
import { gmailAdapter } from "./gmail.ts";
import { gcalAdapter } from "./gcal.ts";
import { slackAdapter } from "./slack.ts";

const adapters = new Map<string, ConnectorAdapter>([
  [gmailAdapter.connectorId, gmailAdapter],
  [gcalAdapter.connectorId, gcalAdapter],
  [slackAdapter.connectorId, slackAdapter],
]);

export function getConnectorAdapter(connectorId: string): ConnectorAdapter | null {
  return adapters.get(connectorId) ?? null;
}

export function registerConnectorAdapter(adapter: ConnectorAdapter) {
  adapters.set(adapter.connectorId, adapter);
}

export function listConnectorAdapters(): ConnectorAdapter[] {
  return [...adapters.values()];
}
