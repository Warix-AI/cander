/** Connector metadata for Work/Connectors UI — not workspace state. */
export type ConnectorInfo = {
  id: string;
  name: string;
};

/**
 * Local-mode mock catalog only (`NEXT_PUBLIC_DATA_BACKEND=local`).
 * Supabase mode reads from `connector_catalog` via GET /api/connectors/catalog.
 */
export const CONNECTOR_CATALOG: ConnectorInfo[] = [
  { id: "gmail", name: "Gmail" },
  { id: "slack", name: "Slack" },
  { id: "gcal", name: "Google Calendar" },
  { id: "github", name: "GitHub" },
  { id: "notion", name: "Notion" },
  { id: "stripe", name: "Stripe" },
  { id: "vercel", name: "Vercel" },
];

export function connectorName(id: string) {
  return CONNECTOR_CATALOG.find((item) => item.id === id)?.name ?? id;
}
