/**
 * Preference helpers for the notification delivery router.
 */

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationChannel,
  type NotificationPreferences,
  type NotificationRecord,
} from "./types.ts";

export function normalizeNotificationPreferences(
  raw: unknown,
): NotificationPreferences {
  const base = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    channels: { ...DEFAULT_NOTIFICATION_PREFERENCES.channels },
    types: { ...DEFAULT_NOTIFICATION_PREFERENCES.types },
    connectors: {},
    connections: {},
  };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  if (typeof o.global_enabled === "boolean") {
    base.global_enabled = o.global_enabled;
  }
  if (o.channels && typeof o.channels === "object") {
    base.channels = {
      ...base.channels,
      ...(o.channels as NotificationPreferences["channels"]),
    };
  }
  if (o.types && typeof o.types === "object") {
    base.types = {
      ...base.types,
      ...(o.types as Record<string, boolean>),
    };
  }
  if (o.connectors && typeof o.connectors === "object") {
    base.connectors = o.connectors as Record<string, boolean>;
  }
  if (o.connections && typeof o.connections === "object") {
    base.connections = o.connections as NotificationPreferences["connections"];
  }
  return base;
}

export function channelAllowed(
  prefs: NotificationPreferences,
  channel: NotificationChannel,
  notification: NotificationRecord,
): boolean {
  if (!prefs.global_enabled) return false;
  if (prefs.channels[channel] === false) return false;

  if (prefs.types[notification.type] === false) return false;

  if (notification.connector) {
    const c = prefs.connectors[notification.connector];
    if (c === false) return false;
  }

  if (notification.connectionId) {
    const conn = prefs.connections[notification.connectionId];
    if (conn?.enabled === false) return false;
    if (conn?.channels?.[channel] === false) return false;
  }

  return true;
}
