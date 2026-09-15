/**
 * Portable notification routing — shared by Capacitor, Electron, and web.
 */

import type { NotificationRecord, NotificationTarget } from "./types.ts";

export type OpenConnectorFocus = {
  connectionId?: string;
  messageId?: string;
  threadId?: string;
};

export type ResolvedNotificationNavigation = {
  kind: "connector";
  connectorId: string;
  focus: OpenConnectorFocus;
} | {
  kind: "fallback";
  connectorId?: string;
} | {
  kind: "none";
};

export function notificationToTarget(
  n: Pick<
    NotificationRecord,
    | "connector"
    | "connectionId"
    | "resourceType"
    | "resourceId"
    | "route"
    | "metadata"
  >,
): NotificationTarget {
  return {
    connector: n.connector,
    connectionId: n.connectionId,
    resourceType: n.resourceType,
    resourceId: n.resourceId,
    route: n.route,
    metadata: n.metadata ?? {},
  };
}

export function resolveNotificationRoute(
  target: NotificationTarget,
): ResolvedNotificationNavigation {
  const connector = target.connector?.trim();
  if (!connector) return { kind: "none" };

  const meta = target.metadata ?? {};
  const messageId =
    (typeof meta.messageId === "string" && meta.messageId.trim()) ||
    (target.resourceType === "gmail_message"
      ? target.resourceId?.trim()
      : undefined) ||
    undefined;
  const threadId =
    (typeof meta.threadId === "string" && meta.threadId.trim()) ||
    (target.resourceType === "gmail_thread"
      ? target.resourceId?.trim()
      : undefined) ||
    undefined;

  return {
    kind: "connector",
    connectorId: connector,
    focus: {
      connectionId: target.connectionId?.trim() || undefined,
      messageId,
      threadId,
    },
  };
}

/** Build Capacitor / custom-scheme launch URL from a portable target. */
export function buildNotifyDeepLink(target: NotificationTarget): string {
  const params = new URLSearchParams();
  if (target.connector) params.set("connector", target.connector);
  if (target.connectionId) params.set("connectionId", target.connectionId);
  if (target.resourceType) params.set("resourceType", target.resourceType);
  if (target.resourceId) params.set("resourceId", target.resourceId);
  if (target.route) params.set("route", target.route);
  const meta = target.metadata ?? {};
  if (typeof meta.messageId === "string") {
    params.set("messageId", meta.messageId);
  }
  if (typeof meta.threadId === "string") {
    params.set("threadId", meta.threadId);
  }
  return `cander://notify?${params.toString()}`;
}

export function parseNotifyDeepLink(url: string): NotificationTarget | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "cander:") return null;
    const host = parsed.hostname || parsed.host;
    const path = parsed.pathname.replace(/^\//, "");
    if (host !== "notify" && path !== "notify" && !url.includes("://notify")) {
      // cander://notify?... → hostname "notify"
      if (host !== "notify") return null;
    }
    const q = parsed.searchParams;
    const connector = q.get("connector");
    if (!connector) return null;
    const metadata: Record<string, unknown> = {};
    const messageId = q.get("messageId");
    const threadId = q.get("threadId");
    if (messageId) metadata.messageId = messageId;
    if (threadId) metadata.threadId = threadId;
    return {
      connector,
      connectionId: q.get("connectionId"),
      resourceType: q.get("resourceType"),
      resourceId: q.get("resourceId"),
      route: q.get("route"),
      metadata,
    };
  } catch {
    return null;
  }
}

export function gmailNotificationRoute(opts: {
  connectionId: string;
  threadId?: string | null;
  messageId: string;
}): string {
  return `/apps/gmail?connectionId=${encodeURIComponent(opts.connectionId)}&messageId=${encodeURIComponent(opts.messageId)}${
    opts.threadId
      ? `&threadId=${encodeURIComponent(opts.threadId)}`
      : ""
  }`;
}
