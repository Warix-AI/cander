/**
 * Adapter registry — resolve connector adapters by connectorId.
 */

import type { ConnectorAdapter } from "./types.ts";
import { gmailAdapter } from "./gmail.ts";
import { gcalAdapter } from "./gcal.ts";
import { gdriveAdapter } from "./gdrive.ts";
import { gsheetsAdapter } from "./gsheets.ts";
import { gdocsAdapter } from "./gdocs.ts";
import { slackAdapter } from "./slack.ts";
import { APP_CONNECTOR_ADAPTERS } from "../apps/adapter-factory.ts";

const adapters = new Map<string, ConnectorAdapter>([
  [gmailAdapter.connectorId, gmailAdapter],
  [gcalAdapter.connectorId, gcalAdapter],
  [gdriveAdapter.connectorId, gdriveAdapter],
  [gsheetsAdapter.connectorId, gsheetsAdapter],
  [gdocsAdapter.connectorId, gdocsAdapter],
  [slackAdapter.connectorId, slackAdapter],
]);

for (const adapter of APP_CONNECTOR_ADAPTERS) {
  // Keep the richer Slack AI tool adapter; app factory only adds list/get via slack.ts.
  if (adapter.connectorId === "slack") continue;
  adapters.set(adapter.connectorId, adapter);
}

export function getConnectorAdapter(connectorId: string): ConnectorAdapter | null {
  return adapters.get(connectorId) ?? null;
}

export function registerConnectorAdapter(adapter: ConnectorAdapter) {
  adapters.set(adapter.connectorId, adapter);
}

export function listConnectorAdapters(): ConnectorAdapter[] {
  return [...adapters.values()];
}
