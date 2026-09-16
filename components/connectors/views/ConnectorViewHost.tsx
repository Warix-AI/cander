"use client";

import { ConnectorBrowserPanel } from "@/components/connectors/views/ConnectorBrowserPanel";

/**
 * Right-panel host for connector views. Browser chrome owns tabs + expand/panel;
 * provider content (Gmail, etc.) renders as the locked first tab.
 */
export function ConnectorViewHost({
  connectorId,
  hideTopChrome = false,
}: {
  connectorId: string;
  /** Workspace renders the tab strip full-width above chat + panel. */
  hideTopChrome?: boolean;
}) {
  return (
    <ConnectorBrowserPanel
      connectorId={connectorId}
      hideTopChrome={hideTopChrome}
    />
  );
}
