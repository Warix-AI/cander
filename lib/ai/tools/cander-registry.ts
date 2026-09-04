/**
 * Normalized CanderTool registry — single source of truth for connector tools.
 * Keeps AiToolDefinition registration in sync for legacy paths.
 */

import type { CanderTool, CapabilityFamily } from "./types.ts";
import { registerGoogleWorkspaceTools } from "./google-workspace-registry.ts";

const tools = new Map<string, CanderTool>();

export function registerCanderTool(tool: CanderTool) {
  if (!/^[a-z][a-z0-9_.-]*$/i.test(tool.id)) {
    throw new Error(`Invalid tool id: ${tool.id}`);
  }
  tools.set(tool.id, tool);
}

export function getCanderTool(id: string): CanderTool | null {
  return tools.get(id) ?? null;
}

export function listCanderTools(): CanderTool[] {
  return [...tools.values()];
}

export function listCanderToolsForConnector(connectorId: string): CanderTool[] {
  return listCanderTools().filter((t) => t.connectorId === connectorId);
}

export function listCanderToolsForFamily(family: CapabilityFamily): CanderTool[] {
  return listCanderTools().filter((t) => t.capabilityFamily === family);
}

export function connectorIdFromToolId(toolId: string): string | null {
  const tool = getCanderTool(toolId);
  if (tool?.connectorId) return tool.connectorId;
  const dot = toolId.indexOf(".");
  return dot > 0 ? toolId.slice(0, dot) : null;
}

/** Capability key used in snapshot (search/read/send/draft/reply). */
export function capabilityKeyFromToolId(toolId: string): string {
  const dot = toolId.indexOf(".");
  return dot > 0 ? toolId.slice(dot + 1) : toolId;
}

// ── Seed connector tools ────────────────────────────────────────────────────

registerCanderTool({
  id: "gmail.search",
  connectorId: "gmail",
  capabilityFamily: "email",
  category: "comms",
  label: "Search mail",
  description:
    "Search the user's connected Gmail using Gmail query syntax (read-only). Returns message summaries with IDs.",
  risk: "read",
  confirmationPolicy: "never",
  defaultEnabled: true,
  providerTool: "GMAIL_FETCH_EMAILS",
  inputSchema: {
    type: "object",
    required: ["query"],
    properties: {
      query: {
        type: "string",
        description: "Gmail search query, e.g. is:unread from:alice newer_than:7d",
      },
      maxResults: {
        type: "number",
        description: "Maximum messages to return (1-25, default 10).",
      },
    },
  },
});

registerCanderTool({
  id: "gmail.read",
  connectorId: "gmail",
  capabilityFamily: "email",
  category: "comms",
  label: "Read mail",
  description:
    "Read a single Gmail message by ID (read-only). Use gmail.search first to discover message IDs.",
  risk: "read",
  confirmationPolicy: "never",
  defaultEnabled: true,
  providerTool: "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
  inputSchema: {
    type: "object",
    required: ["messageId"],
    properties: {
      messageId: {
        type: "string",
        description: "Gmail message ID from gmail.search results.",
      },
    },
  },
});

registerCanderTool({
  id: "gmail.send",
  connectorId: "gmail",
  capabilityFamily: "email",
  category: "comms",
  label: "Send mail",
  description:
    "Send an email via the user's connected Gmail. Requires write access enabled in Connectors.",
  risk: "write",
  confirmationPolicy: "when_ambiguous",
  defaultEnabled: false,
  providerTool: "GMAIL_SEND_EMAIL",
  inputSchema: {
    type: "object",
    required: ["to", "subject", "body"],
    properties: {
      to: { type: "string", description: "Recipient email address." },
      subject: { type: "string", description: "Email subject line." },
      body: { type: "string", description: "Plain-text email body." },
      cc: { type: "string", description: "Optional CC recipients." },
      bcc: { type: "string", description: "Optional BCC recipients." },
    },
  },
});

registerCanderTool({
  id: "gmail.draft",
  connectorId: "gmail",
  capabilityFamily: "email",
  category: "comms",
  label: "Draft mail",
  description:
    "Create a Gmail draft for the user to review. Requires draft mail enabled in Connectors.",
  risk: "write",
  confirmationPolicy: "never",
  defaultEnabled: false,
  providerTool: "GMAIL_CREATE_EMAIL_DRAFT",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Primary recipient email address." },
      subject: { type: "string", description: "Email subject line." },
      body: { type: "string", description: "Plain-text or HTML email body." },
      threadId: {
        type: "string",
        description: "Optional thread ID when drafting a reply.",
      },
    },
  },
});

registerCanderTool({
  id: "gmail.reply",
  connectorId: "gmail",
  capabilityFamily: "email",
  category: "comms",
  label: "Reply in thread",
  description:
    "Reply within an existing Gmail thread. Requires reply in thread enabled in Connectors.",
  risk: "write",
  confirmationPolicy: "when_ambiguous",
  defaultEnabled: false,
  providerTool: "GMAIL_REPLY_TO_THREAD",
  inputSchema: {
    type: "object",
    required: ["threadId", "body"],
    properties: {
      threadId: {
        type: "string",
        description: "Gmail thread ID from search results.",
      },
      body: { type: "string", description: "Reply body text." },
      to: {
        type: "string",
        description: "Optional primary recipient if not inferred from the thread.",
      },
    },
  },
});

registerCanderTool({
  id: "gmail.archive",
  connectorId: "gmail",
  capabilityFamily: "email",
  category: "comms",
  label: "Archive mail",
  description: "Remove a Gmail message from the inbox (archive).",
  risk: "write",
  confirmationPolicy: "never",
  defaultEnabled: true,
  providerTool: "GMAIL_REMOVE_LABEL",
  inputSchema: {
    type: "object",
    required: ["messageId"],
    properties: {
      messageId: { type: "string", description: "Gmail message ID." },
    },
  },
});

registerCanderTool({
  id: "gmail.markRead",
  connectorId: "gmail",
  capabilityFamily: "email",
  category: "comms",
  label: "Mark read",
  description: "Mark a Gmail message as read.",
  risk: "write",
  confirmationPolicy: "never",
  defaultEnabled: true,
  providerTool: "GMAIL_REMOVE_LABEL",
  inputSchema: {
    type: "object",
    required: ["messageId"],
    properties: {
      messageId: { type: "string", description: "Gmail message ID." },
    },
  },
});

registerCanderTool({
  id: "gmail.markUnread",
  connectorId: "gmail",
  capabilityFamily: "email",
  category: "comms",
  label: "Mark unread",
  description: "Mark a Gmail message as unread.",
  risk: "write",
  confirmationPolicy: "never",
  defaultEnabled: true,
  providerTool: "GMAIL_ADD_LABEL_TO_EMAIL",
  inputSchema: {
    type: "object",
    required: ["messageId"],
    properties: {
      messageId: { type: "string", description: "Gmail message ID." },
    },
  },
});

// Slack — Phase 4 seed (adapter + lifecycle enable separately)
registerCanderTool({
  id: "slack.search",
  connectorId: "slack",
  capabilityFamily: "messaging",
  category: "comms",
  label: "Search Slack",
  description: "Search recent Slack messages in connected workspaces.",
  risk: "read",
  confirmationPolicy: "never",
  defaultEnabled: true,
  providerTool: "SLACK_SEARCH_MESSAGES",
  inputSchema: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string", description: "Slack search query." },
      maxResults: {
        type: "number",
        description: "Maximum messages to return (1-25, default 10).",
      },
    },
  },
});

registerCanderTool({
  id: "slack.read",
  connectorId: "slack",
  capabilityFamily: "messaging",
  category: "comms",
  label: "Read Slack message",
  description: "Read a Slack message by channel and timestamp.",
  risk: "read",
  confirmationPolicy: "never",
  defaultEnabled: true,
  providerTool: "SLACK_FETCH_MESSAGE",
  inputSchema: {
    type: "object",
    required: ["channel", "ts"],
    properties: {
      channel: { type: "string", description: "Slack channel ID." },
      ts: { type: "string", description: "Message timestamp ID." },
    },
  },
});

registerCanderTool({
  id: "slack.send",
  connectorId: "slack",
  capabilityFamily: "messaging",
  category: "comms",
  label: "Send Slack message",
  description: "Post a message to a Slack channel. Requires send enabled in Connectors.",
  risk: "write",
  confirmationPolicy: "when_ambiguous",
  defaultEnabled: false,
  providerTool: "SLACK_SEND_MESSAGE",
  inputSchema: {
    type: "object",
    required: ["channel", "text"],
    properties: {
      channel: { type: "string", description: "Slack channel ID or name." },
      text: { type: "string", description: "Message body." },
    },
  },
});

registerGoogleWorkspaceTools(registerCanderTool);
