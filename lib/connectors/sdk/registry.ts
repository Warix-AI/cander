/**
 * Registry of ConnectorViewAdapter implementations.
 */

import type { ConnectorViewAdapter } from "./types.ts";
import { gmailViewAdapter } from "./gmail-adapter.ts";
import { gcalViewAdapter } from "./gcal-adapter.ts";
import { gdriveViewAdapter } from "./gdrive-adapter.ts";
import { gsheetsViewAdapter } from "./gsheets-adapter.ts";
import { gdocsViewAdapter } from "./gdocs-adapter.ts";
import { APP_VIEW_ADAPTERS } from "./app-view-adapters.ts";

const adapters = new Map<string, ConnectorViewAdapter>();

export function registerConnectorViewAdapter(adapter: ConnectorViewAdapter) {
  adapters.set(adapter.connectorId, adapter);
}

export function getConnectorViewAdapter(
  connectorId: string,
): ConnectorViewAdapter | null {
  return adapters.get(connectorId) ?? null;
}

registerConnectorViewAdapter(gmailViewAdapter);
registerConnectorViewAdapter(gcalViewAdapter);
registerConnectorViewAdapter(gdriveViewAdapter);
registerConnectorViewAdapter(gsheetsViewAdapter);
registerConnectorViewAdapter(gdocsViewAdapter);
for (const adapter of APP_VIEW_ADAPTERS) {
  registerConnectorViewAdapter(adapter);
}
