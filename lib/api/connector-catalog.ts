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
  { id: "gcal", name: "Google Calendar" },
  { id: "gdrive", name: "Google Drive" },
  { id: "gsheets", name: "Google Sheets" },
  { id: "gdocs", name: "Google Docs" },
  { id: "outlook", name: "Outlook" },
  { id: "slack", name: "Slack" },
  { id: "notion", name: "Notion" },
  { id: "hubspot", name: "HubSpot" },
  { id: "github", name: "GitHub" },
  { id: "teams", name: "Microsoft Teams" },
  { id: "stripe", name: "Stripe" },
  { id: "shopify", name: "Shopify" },
  { id: "salesforce", name: "Salesforce" },
  { id: "linear", name: "Linear" },
  { id: "jira", name: "Jira" },
];

export function connectorName(id: string) {
  return CONNECTOR_CATALOG.find((item) => item.id === id)?.name ?? id;
}
