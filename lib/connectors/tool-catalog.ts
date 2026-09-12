/**
 * Connector tool catalog — derives from CanderTool registry for connector UI/permissions.
 * Backward-compatible with existing tool-permissions and authz callers.
 */

import {
  listCanderTools,
  listCanderToolsForConnector,
  getCanderTool,
} from "../ai/tools/cander-registry.ts";
import type { ToolRisk } from "../ai/tools/types.ts";

export type ConnectorToolAccess = "read" | "write";

export type ConnectorToolDefinition = {
  id: string;
  connectorId: string;
  label: string;
  description: string;
  access: ConnectorToolAccess;
  defaultEnabled: boolean;
  risk?: ToolRisk;
  confirmationPolicy?: "never" | "when_ambiguous" | "always";
};

/** Short Skills-row copy — AI tools keep full registry descriptions. */
const UI_SKILL_DESCRIPTIONS: Record<string, string> = {
  "gmail.search": "Search mail with Gmail query syntax.",
  "gmail.read": "Open a message by ID.",
  "gmail.send": "Send email from this account.",
  "gmail.draft": "Create a draft to review.",
  "gmail.reply": "Reply in an existing thread.",
  "gmail.archive": "Archive a message from the inbox.",
  "gmail.markRead": "Mark a message as read.",
  "gmail.markUnread": "Mark a message as unread.",
  "slack.search": "Search recent Slack messages.",
  "slack.read": "Open a message by channel and time.",
  "slack.send": "Post a message to a channel.",
  "slack.list": "List channels.",
  "slack.get": "Open a channel.",
  "gcal.listCalendars": "List calendars on this account.",
  "gcal.listEvents": "List events in a time range.",
  "gcal.findEvents": "Search events by text or time.",
  "gcal.createEvent": "Create a calendar event.",
  "gcal.quickAdd": "Create an event from natural language.",
  "gcal.patchEvent": "Update fields on an event.",
  "gcal.updateEvent": "Replace an existing event.",
  "gcal.deleteEvent": "Delete an event.",
  "gdrive.find": "Search Drive files and folders.",
  "gdrive.createFolder": "Create a Drive folder.",
  "gdrive.createFromText": "Create a file from text.",
  "gdrive.download": "Download a file by ID.",
  "gsheets.search": "Find spreadsheets by name.",
  "gsheets.sheetNames": "List worksheet tabs.",
  "gsheets.valuesGet": "Read cells from a range.",
  "gsheets.batchGet": "Read multiple ranges at once.",
  "gsheets.create": "Create a new spreadsheet.",
  "gdocs.search": "Search Docs by name.",
  "gdocs.get": "Open a document by ID.",
  "gdocs.createMarkdown": "Create a Doc from Markdown.",
  "gdocs.updateMarkdown": "Replace Doc content with Markdown.",
  "outlook.list": "List Outlook messages.",
  "outlook.get": "Open a message by ID.",
  "notion.list": "List Notion pages.",
  "notion.get": "Open a page by ID.",
  "hubspot.list": "List HubSpot contacts.",
  "hubspot.get": "Open a contact by ID.",
  "github.list": "List GitHub repositories.",
  "teams.list": "List Microsoft Teams.",
  "teams.get": "Open a team by ID.",
  "stripe.list": "List Stripe customers.",
  "stripe.get": "Open a customer by ID.",
  "stripe.createCustomer": "Create a Stripe customer.",
  "stripe.listInvoices": "List invoices.",
  "stripe.listCharges": "List charges.",
  "stripe.listPaymentIntents": "List payment intents.",
  "stripe.listSubscriptions": "List customer subscriptions.",
  "stripe.listProducts": "List products.",
  "stripe.listPrices": "List prices.",
  "stripe.retrieveBalance": "Get account balance.",
  "salesforce.list": "List Salesforce contacts.",
  "salesforce.get": "Open a contact by ID.",
  "linear.list": "List Linear issues.",
  "linear.search": "Search Linear issues.",
  "linear.get": "Open an issue by ID.",
  "jira.list": "List Jira issues.",
  "jira.get": "Open an issue by ID.",
  "shopify.list": "List Shopify products.",
};

function uiSkillDescription(toolId: string, fallback: string): string {
  const short = UI_SKILL_DESCRIPTIONS[toolId];
  if (short) return short;
  const first = fallback.split(/(?<=\.)\s+/)[0]?.trim() ?? fallback.trim();
  return first.length <= 72 ? first : `${first.slice(0, 69).trimEnd()}…`;
}

function riskToAccess(risk: ToolRisk): ConnectorToolAccess {
  return risk === "read" ? "read" : "write";
}

function toConnectorDef(tool: {
  id: string;
  connectorId?: string;
  label: string;
  description: string;
  risk: ToolRisk;
  confirmationPolicy: "never" | "when_ambiguous" | "always";
  defaultEnabled: boolean;
}): ConnectorToolDefinition | null {
  if (!tool.connectorId) return null;
  return {
    id: tool.id,
    connectorId: tool.connectorId,
    label: tool.label,
    description: uiSkillDescription(tool.id, tool.description),
    access: riskToAccess(tool.risk),
    defaultEnabled: tool.defaultEnabled,
    risk: tool.risk,
    confirmationPolicy: tool.confirmationPolicy,
  };
}

export const CONNECTOR_TOOL_CATALOG: ConnectorToolDefinition[] = listCanderTools()
  .map(toConnectorDef)
  .filter((t): t is ConnectorToolDefinition => t != null);

export function toolsForConnector(connectorId: string): ConnectorToolDefinition[] {
  return listCanderToolsForConnector(connectorId)
    .map(toConnectorDef)
    .filter((t): t is ConnectorToolDefinition => t != null);
}

export function toolDefinition(toolId: string): ConnectorToolDefinition | null {
  const tool = getCanderTool(toolId);
  return tool ? toConnectorDef(tool) : null;
}

export function defaultToolPermissions(connectorId: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const tool of toolsForConnector(connectorId)) {
    out[tool.id] = tool.defaultEnabled;
  }
  return out;
}

export function resolveToolPermissions(
  connectorId: string,
  stored: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  const merged = defaultToolPermissions(connectorId);
  if (!stored || typeof stored !== "object") return merged;
  for (const tool of toolsForConnector(connectorId)) {
    if (typeof stored[tool.id] === "boolean") {
      merged[tool.id] = stored[tool.id]!;
    }
  }
  return merged;
}

export function enabledToolIds(
  connectorId: string,
  stored: Record<string, boolean> | null | undefined,
): string[] {
  const resolved = resolveToolPermissions(connectorId, stored);
  return Object.entries(resolved)
    .filter(([, enabled]) => enabled)
    .map(([id]) => id);
}

export function accessTierEnabled(
  connectorId: string,
  access: ConnectorToolAccess,
  stored: Record<string, boolean> | null | undefined,
): boolean {
  const resolved = resolveToolPermissions(connectorId, stored);
  return toolsForConnector(connectorId)
    .filter((tool) => tool.access === access)
    .some((tool) => resolved[tool.id]);
}

export function setAccessTier(
  connectorId: string,
  access: ConnectorToolAccess,
  enabled: boolean,
  stored: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  const next = resolveToolPermissions(connectorId, stored);
  for (const tool of toolsForConnector(connectorId)) {
    if (tool.access === access) {
      next[tool.id] = enabled;
    }
  }
  return next;
}

export function sanitizeToolPermissionsPatch(
  connectorId: string,
  patch: Record<string, unknown>,
): Record<string, boolean> {
  const allowed = new Set(toolsForConnector(connectorId).map((tool) => tool.id));
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key) || typeof value !== "boolean") continue;
    out[key] = value;
  }
  return out;
}

export function mergeToolPermissions(
  connectorId: string,
  current: Record<string, boolean> | null | undefined,
  patch: Record<string, boolean>,
): Record<string, boolean> {
  const base = resolveToolPermissions(connectorId, current);
  return { ...base, ...patch };
}

export function patchAccessTier(
  connectorId: string,
  access: ConnectorToolAccess,
  enabled: boolean,
  current: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  return setAccessTier(connectorId, access, enabled, current);
}
