/**
 * Client-side notification store + Realtime hydrate.
 */

"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { NotificationRecord } from "./types.ts";

type Listener = () => void;

type NotificationsSnapshot = {
  items: NotificationRecord[];
  unreadCount: number;
};

let items: NotificationRecord[] = [];
let unreadCount = 0;
/** Stable ref for useSyncExternalStore — new object only when data changes. */
let snapshot: NotificationsSnapshot = { items, unreadCount };
const EMPTY_SNAPSHOT: NotificationsSnapshot = { items: [], unreadCount: 0 };
const listeners = new Set<Listener>();
let channel: ReturnType<
  ReturnType<typeof createSupabaseBrowserClient>["channel"]
> | null = null;
let activeProfileId: string | null = null;

function emit() {
  snapshot = { items, unreadCount };
  listeners.forEach((l) => l());
}

function mapRow(row: Record<string, unknown>): NotificationRecord {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    workspaceId: String(row.workspace_id),
    type: String(row.type),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    connector: typeof row.connector === "string" ? row.connector : null,
    connectionId:
      typeof row.connection_id === "string" ? row.connection_id : null,
    resourceType:
      typeof row.resource_type === "string" ? row.resource_type : null,
    resourceId: typeof row.resource_id === "string" ? row.resource_id : null,
    route: typeof row.route === "string" ? row.route : null,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    dedupeKey: typeof row.dedupe_key === "string" ? row.dedupe_key : null,
    readAt: typeof row.read_at === "string" ? row.read_at : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function recomputeUnread() {
  unreadCount = items.filter((n) => !n.readAt).length;
}

export function getNotificationsSnapshot() {
  return snapshot;
}

export function getNotificationsServerSnapshot(): NotificationsSnapshot {
  return EMPTY_SNAPSHOT;
}

export function subscribeNotifications(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function hydrateNotifications(profileId: string, limit = 50) {
  activeProfileId = profileId;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[notifications] hydrate failed", error.message);
    return;
  }
  items = (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
  recomputeUnread();
  emit();
}

export function upsertNotificationLocal(row: NotificationRecord) {
  const idx = items.findIndex((n) => n.id === row.id);
  if (idx >= 0) {
    items = [...items.slice(0, idx), row, ...items.slice(idx + 1)];
  } else {
    items = [row, ...items].slice(0, 100);
  }
  recomputeUnread();
  emit();
}

export async function markNotificationRead(id: string) {
  const supabase = createSupabaseBrowserClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("id", id);
  if (error) {
    console.warn("[notifications] mark read failed", error.message);
    return;
  }
  items = items.map((n) => (n.id === id ? { ...n, readAt: now } : n));
  recomputeUnread();
  emit();
}

export async function markAllNotificationsRead() {
  if (!activeProfileId) return;
  const supabase = createSupabaseBrowserClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("profile_id", activeProfileId)
    .is("read_at", null);
  if (error) {
    console.warn("[notifications] mark all failed", error.message);
    return;
  }
  items = items.map((n) => ({ ...n, readAt: n.readAt ?? now }));
  recomputeUnread();
  emit();
}

export type NotificationInsertHandler = (n: NotificationRecord) => void;

let insertHandlers = new Set<NotificationInsertHandler>();

export function onNotificationInsert(handler: NotificationInsertHandler) {
  insertHandlers.add(handler);
  return () => insertHandlers.delete(handler);
}

/** Subscribe to postgres_changes for the signed-in profile. */
export function startNotificationRealtime(profileId: string) {
  stopNotificationRealtime();
  activeProfileId = profileId;
  const supabase = createSupabaseBrowserClient();
  channel = supabase
    .channel(`notifications:${profileId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `profile_id=eq.${profileId}`,
      },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const oldId = (payload.old as { id?: string } | null)?.id;
          if (oldId) {
            items = items.filter((n) => n.id !== oldId);
            recomputeUnread();
            emit();
          }
          return;
        }
        const row = payload.new as Record<string, unknown> | null;
        if (!row?.id) return;
        const mapped = mapRow(row);
        const wasNew =
          payload.eventType === "INSERT" &&
          !items.some((n) => n.id === mapped.id);
        upsertNotificationLocal(mapped);
        if (wasNew) {
          insertHandlers.forEach((h) => h(mapped));
        }
      },
    )
    .subscribe();
}

export function stopNotificationRealtime() {
  if (channel) {
    void createSupabaseBrowserClient().removeChannel(channel);
    channel = null;
  }
}
