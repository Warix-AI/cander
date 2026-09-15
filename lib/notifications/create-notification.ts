/**
 * createNotification — single entry point for all producers (Gmail, etc.).
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deliverNotification } from "./deliver.ts";
import type {
  CreateNotificationInput,
  NotificationRecord,
} from "./types.ts";

function newNotificationId() {
  return `nt_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
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

export type CreateNotificationResult =
  | { ok: true; notification: NotificationRecord; duplicate?: boolean }
  | { ok: false; error: string };

/**
 * Persist a notification and fan out via the delivery router.
 * Soft-fails delivery; insert errors are returned.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<CreateNotificationResult> {
  try {
    const admin = createSupabaseAdminClient();
    const id = newNotificationId();
    const title = input.title.trim().slice(0, 120) || "Cander";
    const body = input.body.trim().slice(0, 240);

    // Optional: ensure connection belongs to this profile when provided.
    if (input.connectionId) {
      const { data: conn } = await admin
        .from("connector_connections")
        .select("id, owner_id, workspace_id")
        .eq("id", input.connectionId)
        .maybeSingle();
      if (!conn) {
        return { ok: false, error: "Connection not found." };
      }
      if (String(conn.owner_id) !== input.profileId) {
        return { ok: false, error: "Connection does not belong to profile." };
      }
      if (String(conn.workspace_id) !== input.workspaceId) {
        return { ok: false, error: "Connection workspace mismatch." };
      }
    }

    const row = {
      id,
      profile_id: input.profileId,
      workspace_id: input.workspaceId,
      type: input.type,
      title,
      body,
      connector: input.connector ?? null,
      connection_id: input.connectionId ?? null,
      resource_type: input.resourceType ?? null,
      resource_id: input.resourceId ?? null,
      route: input.route ?? null,
      metadata: input.metadata ?? {},
      dedupe_key: input.dedupeKey ?? null,
    };

    const { data, error } = await admin
      .from("notifications")
      .insert(row)
      .select("*")
      .maybeSingle();

    if (error) {
      if (/duplicate|unique/i.test(error.message) && input.dedupeKey) {
        const { data: existing } = await admin
          .from("notifications")
          .select("*")
          .eq("profile_id", input.profileId)
          .eq("dedupe_key", input.dedupeKey)
          .maybeSingle();
        if (existing) {
          return {
            ok: true,
            notification: mapRow(existing as Record<string, unknown>),
            duplicate: true,
          };
        }
      }
      return { ok: false, error: error.message };
    }

    if (!data) return { ok: false, error: "Insert returned no row." };
    const notification = mapRow(data as Record<string, unknown>);
    // Fire-and-forget delivery — never block producers on push.
    void deliverNotification(notification);
    return { ok: true, notification };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "createNotification failed.",
    };
  }
}
