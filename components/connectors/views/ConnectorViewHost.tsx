"use client";

import { ConnectorBrowserPanel } from "@/components/connectors/views/ConnectorBrowserPanel";

/**
 * Right-panel host for connector views. Browser chrome owns tabs + expand/panel;
 * provider content (Gmail, etc.) renders as the locked first tab.
 */
export function ConnectorViewHost({ connectorId }: { connectorId: string }) {
  return <ConnectorBrowserPanel connectorId={connectorId} />;
}
