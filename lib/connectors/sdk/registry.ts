/**
 * Registry of ConnectorViewAdapter implementations.
 */

import type { ConnectorViewAdapter } from "./types.ts";
import { gmailViewAdapter } from "./gmail-adapter.ts";
import { gcalViewAdapter } from "./gcal-adapter.ts";

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
