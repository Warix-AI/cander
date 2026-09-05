/**
 * Google Calendar connector adapter — Composio slug/arg/result mapping.
 */

import { GCAL_COMPOSIO_SLUGS } from "../google-workspace-composio.ts";
import {
  buildSuccessResult,
  pickString,
  unwrapProviderData,
  type ConnectorAdapter,
} from "./types.ts";

type GcalToolName = keyof typeof GCAL_COMPOSIO_SLUGS;

function isGcalTool(toolId: string): toolId is GcalToolName {
  return toolId in GCAL_COMPOSIO_SLUGS;
}

function mapGcalArguments(
  toolId: GcalToolName,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (toolId === "gcal.listEvents") {
    const out: Record<string, unknown> = {
      calendarId: pickString(args.calendarId, args.calendar_id) || "primary",
      singleEvents: true,
      orderBy: "startTime",
      maxResults: Math.min(50, Math.max(1, Number(args.maxResults) || 25)),
    };
    if (args.timeMin || args.time_min) {
      out.timeMin = String(args.timeMin ?? args.time_min);
    }
    if (args.timeMax || args.time_max) {
      out.timeMax = String(args.timeMax ?? args.time_max);
    }
    if (args.query || args.q) out.q = String(args.query ?? args.q);
    return out;
  }

  if (toolId === "gcal.findEvents") {
    return {
      query: pickString(args.query, args.q) || "",
      calendarId: pickString(args.calendarId, args.calendar_id) || "primary",
    };
  }

  if (toolId === "gcal.createEvent") {
    const summary = pickString(args.summary, args.title);
    if (!summary) throw new Error("Missing required argument: summary");
    const start = pickString(args.start, args.startTime, args.start_time);
    if (!start) throw new Error("Missing required argument: start");
    // Composio strips timezone from start_datetime — pass IANA timezone separately.
    const startClean = start.replace(/\.\d{3}/, "").replace(/([Zz]|[+-]\d{2}:?\d{2})$/, "");
    const out: Record<string, unknown> = {
      summary,
      start_datetime: startClean,
      calendar_id: pickString(args.calendarId, args.calendar_id) || "primary",
      event_duration_hour: 1,
      event_duration_minutes: 0,
      timezone: pickString(args.timezone) || "UTC",
    };
    const duration = Number(args.durationMinutes ?? args.duration_minutes);
    if (Number.isFinite(duration) && duration > 0) {
      out.event_duration_hour = Math.floor(duration / 60);
      out.event_duration_minutes = duration % 60;
    }
    if (args.description) out.description = String(args.description);
    const attendees = pickString(args.attendees);
    if (attendees) {
      out.attendees = attendees.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    }
    return out;
  }

  if (toolId === "gcal.quickAdd") {
    const text = pickString(args.text, args.query);
    if (!text) throw new Error("Missing required argument: text");
    return {
      text,
      calendar_id: pickString(args.calendarId, args.calendar_id) || "primary",
    };
  }

  if (toolId === "gcal.listCalendars") {
    return {};
  }

  if (toolId === "gcal.patchEvent" || toolId === "gcal.updateEvent") {
    const eventId = pickString(args.eventId, args.event_id);
    if (!eventId) throw new Error("Missing required argument: eventId");
    return {
      event_id: eventId,
      calendar_id: pickString(args.calendarId, args.calendar_id) || "primary",
      ...(args.summary ? { summary: String(args.summary) } : {}),
      ...(args.description ? { description: String(args.description) } : {}),
    };
  }

  if (toolId === "gcal.deleteEvent") {
    const eventId = pickString(args.eventId, args.event_id);
    if (!eventId) throw new Error("Missing required argument: eventId");
    return {
      event_id: eventId,
      calendar_id: pickString(args.calendarId, args.calendar_id) || "primary",
    };
  }

  return { ...args };
}

export const gcalAdapter: ConnectorAdapter = {
  connectorId: "gcal",

  mapArguments(toolId, args) {
    if (!isGcalTool(toolId)) {
      throw new Error(`Unsupported Calendar tool: ${toolId}`);
    }
    return mapGcalArguments(toolId, args);
  },

  providerSlug(toolId) {
    if (!isGcalTool(toolId)) {
      throw new Error(`Unsupported Calendar tool: ${toolId}`);
    }
    return GCAL_COMPOSIO_SLUGS[toolId];
  },

  normalizeResult(input) {
    if (!isGcalTool(input.toolId)) {
      throw new Error(`Unsupported Calendar tool: ${input.toolId}`);
    }
    const data = unwrapProviderData(input.raw);
    return buildSuccessResult({
      toolId: input.toolId,
      toolCallId: input.toolCallId,
      idempotencyKey: input.idempotencyKey,
      connectionId: input.connectionId,
      data,
    });
  },
};
