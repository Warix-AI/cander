/**
 * Cander tool registry seed for Google Calendar / Drive / Sheets / Docs.
 * Provider slugs map to Composio (see google-workspace-composio.ts).
 */

import type { CanderTool } from "./types.ts";
import {
  GCAL_COMPOSIO_SLUGS,
  GDOCS_COMPOSIO_SLUGS,
  GDRIVE_COMPOSIO_SLUGS,
  GSHEETS_COMPOSIO_SLUGS,
} from "../../connectors/google-workspace-composio.ts";

export function registerGoogleWorkspaceTools(
  registerCanderTool: (tool: CanderTool) => void,
) {
  registerCanderTool({
    id: "gcal.listCalendars",
    connectorId: "gcal",
    capabilityFamily: "calendar",
    category: "productivity",
    label: "List calendars",
    description: "List calendars on the connected Google Calendar account.",
    risk: "read",
    confirmationPolicy: "never",
    defaultEnabled: true,
    providerTool: GCAL_COMPOSIO_SLUGS["gcal.listCalendars"],
    inputSchema: { type: "object", properties: {} },
  });

  registerCanderTool({
    id: "gcal.listEvents",
    connectorId: "gcal",
    capabilityFamily: "calendar",
    category: "productivity",
    label: "List events",
    description: "List events on a Google Calendar within an optional time range.",
    risk: "read",
    confirmationPolicy: "never",
    defaultEnabled: true,
    providerTool: GCAL_COMPOSIO_SLUGS["gcal.listEvents"],
    inputSchema: {
      type: "object",
      properties: {
        calendarId: { type: "string", description: "Calendar id (default primary)." },
        timeMin: { type: "string", description: "RFC3339 lower bound." },
        timeMax: { type: "string", description: "RFC3339 upper bound." },
        maxResults: { type: "number", description: "Max events to return." },
      },
    },
  });

  registerCanderTool({
    id: "gcal.findEvents",
    connectorId: "gcal",
    capabilityFamily: "calendar",
    category: "productivity",
    label: "Find events",
    description: "Search Google Calendar events by text query and/or time range.",
    risk: "read",
    confirmationPolicy: "never",
    defaultEnabled: true,
    providerTool: GCAL_COMPOSIO_SLUGS["gcal.findEvents"],
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text event search." },
        calendarId: { type: "string", description: "Calendar id (default primary)." },
      },
    },
  });

  registerCanderTool({
    id: "gcal.createEvent",
    connectorId: "gcal",
    capabilityFamily: "calendar",
    category: "productivity",
    label: "Create event",
    description: "Create a Google Calendar event with start time and duration.",
    risk: "write",
    confirmationPolicy: "when_ambiguous",
    defaultEnabled: false,
    providerTool: GCAL_COMPOSIO_SLUGS["gcal.createEvent"],
    inputSchema: {
      type: "object",
      required: ["summary", "start"],
      properties: {
        summary: { type: "string", description: "Event title." },
        start: { type: "string", description: "Start datetime (RFC3339 or local)." },
        durationMinutes: { type: "number", description: "Duration in minutes." },
        description: { type: "string", description: "Event description." },
        attendees: { type: "string", description: "Comma-separated attendee emails." },
      },
    },
  });

  registerCanderTool({
    id: "gcal.quickAdd",
    connectorId: "gcal",
    capabilityFamily: "calendar",
    category: "productivity",
    label: "Quick add",
    description: "Create a calendar event from natural language (e.g. Lunch tomorrow 1pm).",
    risk: "write",
    confirmationPolicy: "when_ambiguous",
    defaultEnabled: false,
    providerTool: GCAL_COMPOSIO_SLUGS["gcal.quickAdd"],
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", description: "Natural language event text." },
      },
    },
  });

  // ── Drive ───────────────────────────────────────────────────────────────────
  registerCanderTool({
    id: "gdrive.find",
    connectorId: "gdrive",
    capabilityFamily: "files",
    category: "productivity",
    label: "Find files",
    description: "Search Google Drive files and folders by name or query.",
    risk: "read",
    confirmationPolicy: "never",
    defaultEnabled: true,
    providerTool: GDRIVE_COMPOSIO_SLUGS["gdrive.find"],
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Drive search query." },
        maxResults: { type: "number", description: "Max files to return." },
      },
    },
  });

  registerCanderTool({
    id: "gdrive.createFolder",
    connectorId: "gdrive",
    capabilityFamily: "files",
    category: "productivity",
    label: "Create folder",
    description: "Create a folder in Google Drive.",
    risk: "write",
    confirmationPolicy: "never",
    defaultEnabled: false,
    providerTool: GDRIVE_COMPOSIO_SLUGS["gdrive.createFolder"],
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Folder name." },
        parentId: { type: "string", description: "Optional parent folder id." },
      },
    },
  });

  registerCanderTool({
    id: "gdrive.createFromText",
    connectorId: "gdrive",
    capabilityFamily: "files",
    category: "productivity",
    label: "Create file from text",
    description: "Create a Drive file from text content.",
    risk: "write",
    confirmationPolicy: "when_ambiguous",
    defaultEnabled: false,
    providerTool: GDRIVE_COMPOSIO_SLUGS["gdrive.createFromText"],
    inputSchema: {
      type: "object",
      required: ["name", "content"],
      properties: {
        name: { type: "string", description: "File name." },
        content: { type: "string", description: "Text content." },
      },
    },
  });

  registerCanderTool({
    id: "gdrive.download",
    connectorId: "gdrive",
    capabilityFamily: "files",
    category: "productivity",
    label: "Download file",
    description: "Download a Google Drive file by id (exports Workspace docs when needed).",
    risk: "read",
    confirmationPolicy: "never",
    defaultEnabled: true,
    providerTool: GDRIVE_COMPOSIO_SLUGS["gdrive.download"],
    inputSchema: {
      type: "object",
      required: ["fileId"],
      properties: {
        fileId: { type: "string", description: "Drive file id." },
      },
    },
  });

  // ── Sheets ──────────────────────────────────────────────────────────────────
  registerCanderTool({
    id: "gsheets.search",
    connectorId: "gsheets",
    capabilityFamily: "files",
    category: "productivity",
    label: "Search spreadsheets",
    description: "Find Google Sheets spreadsheets by name.",
    risk: "read",
    confirmationPolicy: "never",
    defaultEnabled: true,
    providerTool: GSHEETS_COMPOSIO_SLUGS["gsheets.search"],
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Spreadsheet name query." },
      },
    },
  });

  registerCanderTool({
    id: "gsheets.sheetNames",
    connectorId: "gsheets",
    capabilityFamily: "files",
    category: "productivity",
    label: "List sheet tabs",
    description: "List worksheet tab names in a spreadsheet.",
    risk: "read",
    confirmationPolicy: "never",
    defaultEnabled: true,
    providerTool: GSHEETS_COMPOSIO_SLUGS["gsheets.sheetNames"],
    inputSchema: {
      type: "object",
      required: ["spreadsheetId"],
      properties: {
        spreadsheetId: { type: "string", description: "Spreadsheet id." },
      },
    },
  });

  registerCanderTool({
    id: "gsheets.valuesGet",
    connectorId: "gsheets",
    capabilityFamily: "files",
    category: "productivity",
    label: "Read range",
    description: "Read cell values from a Google Sheets range (A1 notation).",
    risk: "read",
    confirmationPolicy: "never",
    defaultEnabled: true,
    providerTool: GSHEETS_COMPOSIO_SLUGS["gsheets.valuesGet"],
    inputSchema: {
      type: "object",
      required: ["spreadsheetId", "range"],
      properties: {
        spreadsheetId: { type: "string", description: "Spreadsheet id." },
        range: { type: "string", description: "A1 range, e.g. Sheet1!A1:D20." },
      },
    },
  });

  registerCanderTool({
    id: "gsheets.batchGet",
    connectorId: "gsheets",
    capabilityFamily: "files",
    category: "productivity",
    label: "Batch read ranges",
    description: "Read multiple ranges from a spreadsheet in one call.",
    risk: "read",
    confirmationPolicy: "never",
    defaultEnabled: true,
    providerTool: GSHEETS_COMPOSIO_SLUGS["gsheets.batchGet"],
    inputSchema: {
      type: "object",
      required: ["spreadsheetId", "ranges"],
      properties: {
        spreadsheetId: { type: "string", description: "Spreadsheet id." },
        ranges: { type: "string", description: "Comma-separated A1 ranges." },
      },
    },
  });

  registerCanderTool({
    id: "gsheets.create",
    connectorId: "gsheets",
    capabilityFamily: "files",
    category: "productivity",
    label: "Create spreadsheet",
    description: "Create a new Google Spreadsheet in Drive.",
    risk: "write",
    confirmationPolicy: "when_ambiguous",
    defaultEnabled: false,
    providerTool: GSHEETS_COMPOSIO_SLUGS["gsheets.create"],
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Spreadsheet title." },
        folderId: { type: "string", description: "Optional Drive folder id." },
      },
    },
  });

  // ── Docs ────────────────────────────────────────────────────────────────────
  registerCanderTool({
    id: "gdocs.search",
    connectorId: "gdocs",
    capabilityFamily: "files",
    category: "productivity",
    label: "Search documents",
    description: "Search Google Docs by name or content filters.",
    risk: "read",
    confirmationPolicy: "never",
    defaultEnabled: true,
    providerTool: GDOCS_COMPOSIO_SLUGS["gdocs.search"],
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Document search query." },
      },
    },
  });

  registerCanderTool({
    id: "gdocs.get",
    connectorId: "gdocs",
    capabilityFamily: "files",
    category: "productivity",
    label: "Open document",
    description: "Fetch a Google Doc by id.",
    risk: "read",
    confirmationPolicy: "never",
    defaultEnabled: true,
    providerTool: GDOCS_COMPOSIO_SLUGS["gdocs.get"],
    inputSchema: {
      type: "object",
      required: ["documentId"],
      properties: {
        documentId: { type: "string", description: "Document id." },
      },
    },
  });

  registerCanderTool({
    id: "gdocs.createMarkdown",
    connectorId: "gdocs",
    capabilityFamily: "files",
    category: "productivity",
    label: "Create from Markdown",
    description: "Create a Google Doc, optionally seeded with Markdown content.",
    risk: "write",
    confirmationPolicy: "when_ambiguous",
    defaultEnabled: false,
    providerTool: GDOCS_COMPOSIO_SLUGS["gdocs.createMarkdown"],
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string", description: "Document title." },
        markdown: { type: "string", description: "Optional Markdown body." },
      },
    },
  });

  registerCanderTool({
    id: "gdocs.updateMarkdown",
    connectorId: "gdocs",
    capabilityFamily: "files",
    category: "productivity",
    label: "Replace with Markdown",
    description: "Replace an existing Google Doc's content with Markdown.",
    risk: "write",
    confirmationPolicy: "always",
    defaultEnabled: false,
    providerTool: GDOCS_COMPOSIO_SLUGS["gdocs.updateMarkdown"],
    inputSchema: {
      type: "object",
      required: ["documentId", "markdown"],
      properties: {
        documentId: { type: "string", description: "Document id." },
        markdown: { type: "string", description: "Markdown content." },
      },
    },
  });

}
