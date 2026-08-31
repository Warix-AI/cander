/** Connector metadata for Work/Connectors UI — not workspace state. */
export type ConnectorInfo = {
  id: string;
  name: string;
};

export const CONNECTOR_CATALOG: ConnectorInfo[] = [
  { id: "gmail", name: "Gmail" },
  { id: "slack", name: "Slack" },
  { id: "gcal", name: "Google Calendar" },
  { id: "github", name: "GitHub" },
  { id: "notion", name: "Notion" },
  { id: "linear", name: "Linear" },
  { id: "figma", name: "Figma" },
  { id: "gdrive", name: "Google Drive" },
  { id: "stripe", name: "Stripe" },
  { id: "handshake", name: "Handshake" },
  { id: "apple-health", name: "Apple Health" },
];

export function connectorName(id: string) {
  return CONNECTOR_CATALOG.find((item) => item.id === id)?.name ?? id;
}
