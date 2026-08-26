export const MCPUI_CONNECTOR_IDS = ["gmail", "handshake"] as const;

export type McpuiConnectorId = (typeof MCPUI_CONNECTOR_IDS)[number];

export function isMcpuiConnector(id: string | null | undefined): id is McpuiConnectorId {
  return (
    id != null &&
    (MCPUI_CONNECTOR_IDS as readonly string[]).includes(id)
  );
}
