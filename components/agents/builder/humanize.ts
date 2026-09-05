/**
 * Human-readable labels for agent workflow steps and connector tools.
 */

import { toolDefinition } from "@/lib/connectors/tool-catalog";

const CONNECTOR_NAMES: Record<string, string> = {
  gmail: "Gmail",
  google_calendar: "Google Calendar",
  google_drive: "Google Drive",
  google_sheets: "Google Sheets",
  google_docs: "Google Docs",
  slack: "Slack",
  hubspot: "HubSpot",
  notion: "Notion",
  linear: "Linear",
  github: "GitHub",
};

export function humanizeConnectorId(connectorId: string): string {
  const key = connectorId.trim().toLowerCase();
  if (CONNECTOR_NAMES[key]) return CONNECTOR_NAMES[key];
  return connectorId
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function humanizeToolId(toolId: string): string {
  const def = toolDefinition(toolId);
  if (def?.label) return def.label;
  const stripped = toolId
    .replace(/^(gmail|slack|hubspot|notion|linear|github|google_[a-z]+)_/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!stripped) return toolId;
  return stripped.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isPlaceholderTriggerLabel(label: string | undefined): boolean {
  const t = (label ?? "").trim().toLowerCase();
  return (
    !t ||
    t === "when something happens" ||
    t === "choose a trigger…" ||
    t === "choose a trigger..." ||
    t.startsWith("when (configure)")
  );
}

export function isPlaceholderCondition(
  expression: string | undefined,
  type: string | undefined,
): boolean {
  const e = (expression ?? "").trim().toLowerCase();
  const t = (type ?? "").trim().toLowerCase();
  return (
    t === "always" ||
    !e ||
    e === "if always" ||
    e === "always" ||
    e.startsWith("if (configure)")
  );
}

export function isPlaceholderActionLabel(label: string | undefined): boolean {
  const t = (label ?? "").trim().toLowerCase();
  return (
    !t ||
    t === "do an action" ||
    t === "choose an action…" ||
    t === "choose an action..." ||
    t.startsWith("do (configure)")
  );
}
