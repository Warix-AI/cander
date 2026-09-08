/**
 * ConnectorFocus — ambient context from the active connector panel (Docs/Sheets/Drive/…).
 *
 * Mirrors BrowsingFocus for websites: while the user is in a connector (and optionally
 * viewing a specific item), chat quietly receives that context + prefers that
 * connector's MCP tools. Not an explicit @-chip.
 *
 * Focus is persisted in sessionStorage so mobile Chat|Panel toggles (which unmount
 * the connector view) do not wipe the open document/sheet/file.
 */

import { browsingFocusSystemBlock } from "@/lib/browser-context/browsing-focus";

type Listener = () => void;

export type ConnectorFocusItemKind =
  | "doc"
  | "sheet"
  | "drive-file"
  | "folder"
  | "email"
  | "event"
  | "other";

export type ConnectorFocus = {
  connectorId: string;
  connectorLabel: string;
  itemId?: string;
  itemTitle?: string;
  itemKind?: ConnectorFocusItemKind;
  mimeType?: string;
  openUrl?: string;
  /** Active sheet tab name when viewing a spreadsheet. */
  sheetTab?: string;
};

const CONNECTOR_LABELS: Record<string, string> = {
  gdocs: "Google Docs",
  gsheets: "Google Sheets",
  gdrive: "Google Drive",
  gmail: "Gmail",
  gcal: "Google Calendar",
  stripe: "Stripe",
};

const STORAGE_KEY = "cander:connector-focus:v1";

let focus: ConnectorFocus | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

function persist(next: ConnectorFocus | null) {
  if (typeof window === "undefined") return;
  try {
    if (!next) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

function restore(): ConnectorFocus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConnectorFocus;
    if (!parsed?.connectorId || typeof parsed.connectorId !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// Hydrate once on the client so chat still sees the open sheet/doc after
// panel remounts (mobile Chat|Panel toggles).
if (typeof window !== "undefined" && focus == null) {
  focus = restore();
}

export function connectorLabelForId(connectorId: string): string {
  return CONNECTOR_LABELS[connectorId] ?? connectorId;
}

export function setConnectorFocus(next: ConnectorFocus | null) {
  if (sameFocus(focus, next)) return;
  focus = next;
  persist(next);
  emit();
}

/**
 * Publish connector-level focus without wiping an open item for the same app.
 * Used by the panel shell while browsing; detail views own item ids.
 */
export function setConnectorBrowseFocus(input: {
  connectorId: string;
  connectorLabel: string;
}) {
  if (
    focus &&
    focus.connectorId === input.connectorId &&
    focus.itemId
  ) {
    return;
  }
  setConnectorFocus({
    connectorId: input.connectorId,
    connectorLabel: input.connectorLabel,
  });
}

export function clearConnectorFocus(connectorId?: string) {
  if (!focus) return;
  if (connectorId && focus.connectorId !== connectorId) return;
  focus = null;
  persist(null);
  emit();
}

function sameFocus(a: ConnectorFocus | null, b: ConnectorFocus | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.connectorId === b.connectorId &&
    a.connectorLabel === b.connectorLabel &&
    a.itemId === b.itemId &&
    a.itemTitle === b.itemTitle &&
    a.itemKind === b.itemKind &&
    a.mimeType === b.mimeType &&
    a.openUrl === b.openUrl &&
    a.sheetTab === b.sheetTab
  );
}

export function subscribeConnectorFocus(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getConnectorFocusSnapshot(): ConnectorFocus | null {
  if (focus == null && typeof window !== "undefined") {
    focus = restore();
  }
  return focus;
}

export function getConnectorFocusServerSnapshot(): ConnectorFocus | null {
  return null;
}

/** Soft composer placeholder — connector name only (item titles get too long). */
export function connectorFocusComposerPlaceholder(
  current: ConnectorFocus | null = getConnectorFocusSnapshot(),
): string | null {
  if (!current) return null;
  return `Message about ${current.connectorLabel}`;
}

/**
 * Hidden system block for the model. Soft-gated like BrowsingFocus for
 * connector-only browsing; when a specific item is open, treat it as the
 * active on-screen subject and fetch it via connected-app tools.
 */
export function connectorFocusSystemBlock(
  current: ConnectorFocus | null = getConnectorFocusSnapshot(),
): string {
  if (!current) return "";
  if (current.itemId) {
    const toolHint = toolHintForFocus(current);
    return [
      "## ConnectorFocus (active on-screen item)",
      "You cannot see the user's screen. You DO have connected-app MCP/tools for this connector while it is connected.",
      "The user is viewing this item in the connector panel. Treat it as the subject of \"this document\", \"this spreadsheet\", \"this file\", \"this\", etc.",
      `- connectorId: ${current.connectorId}`,
      `- connector: ${current.connectorLabel}`,
      `- itemId: ${current.itemId}`,
      `- itemTitle: ${current.itemTitle ?? "untitled"}`,
      `- itemKind: ${current.itemKind ?? "other"}`,
      `- sheetTab: ${current.sheetTab ?? "n/a"}`,
      `- mimeType: ${current.mimeType ?? "n/a"}`,
      `- openUrl: ${current.openUrl ?? "n/a"}`,
      toolHint,
      "REQUIRED: If the user asks about this item (summarize, explain, what it says, reviews, values, etc.), call the tool(s) above with the itemId before answering.",
      "Do NOT say you cannot see the document, do not have its contents, lack access, or ask the user to paste text — fetch it with tools.",
      "Do not ask which document/spreadsheet/file they mean while this focus is present.",
      "If the message is clearly about something else unrelated, you may ignore ConnectorFocus.",
    ].join("\n");
  }
  return [
    "## ConnectorFocus (ambient — optional context)",
    "You cannot see the user's screen. You DO have connected-app MCP/tools for this connector while it is connected.",
    `The user is currently in connected app: connectorId=${current.connectorId}; label=${current.connectorLabel}; item=none (browsing connector list).`,
    "This is NOT an explicit attachment. Prefer this connector's MCP/tools when answering about what they are looking at.",
    "If they ask about something in this app, search/open it with tools — never claim access isn't enabled or ask them to paste content.",
    "Do not mention the connector unless the user's message clearly refers to this app or what they are viewing.",
    "If the message is unrelated general chat, ignore ConnectorFocus completely.",
  ].join("\n");
}

function toolHintForFocus(current: ConnectorFocus): string {
  const id = current.itemId!;
  const title = current.itemTitle?.trim() || "untitled";
  const tab = current.sheetTab?.trim();
  switch (current.connectorId) {
    case "gdocs":
      return `Suggested tools: call gdocs.get with documentId="${id}" (title "${title}"). If get fails, gdocs.search with query="${title}".`;
    case "gsheets":
      return tab
        ? `Suggested tools: call gsheets.sheetNames then gsheets.valuesGet with spreadsheetId="${id}" and the active tab "${tab}" (title "${title}").`
        : `Suggested tools: call gsheets.sheetNames then gsheets.valuesGet with spreadsheetId="${id}" (title "${title}").`;
    case "gdrive":
      return `Suggested tools: call gdrive.download or gdrive.find for file id="${id}" (name "${title}").`;
    case "gmail":
      return `Suggested tools: use Gmail tools to open/search message or thread id="${id}" (subject/from "${title}").`;
    case "gcal":
      return `Suggested tools: use Google Calendar tools for event id="${id}" (summary "${title}").`;
    case "stripe":
      return `Suggested tools: use Stripe tools for id="${id}" (label "${title}").`;
    default:
      return `Suggested tools: use ${current.connectorLabel} MCP/tools with itemId="${id}" (title "${title}"). Search by title if a direct get is unavailable.`;
  }
}

/** Combine browsing + connector ambient blocks for agent/raw transports. */
export function buildAmbientFocusToolContext(): string {
  const parts: string[] = [];
  try {
    const browsing = browsingFocusSystemBlock().trim();
    if (browsing) parts.push(browsing);
  } catch {
    /* ignore */
  }
  const connector = connectorFocusSystemBlock().trim();
  if (connector) parts.push(connector);
  return parts.join("\n\n");
}
