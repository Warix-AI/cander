/**
 * Allowlisted connector audit inserts — server-only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectorAuditDetail, ConnectorAuditEventType } from "./types.ts";
import { newAuditEventId } from "./mapper.ts";

const ALLOWED_DETAIL_KEYS = new Set([
  "reason_code",
  "connector_id",
  "connection_id",
  "workspace_id",
  "http_status",
]);

export function sanitizeAuditDetail(
  detail: ConnectorAuditDetail,
): ConnectorAuditDetail {
  const next: ConnectorAuditDetail = {};
  for (const [key, value] of Object.entries(detail)) {
    if (!ALLOWED_DETAIL_KEYS.has(key)) continue;
    if (typeof value === "string" || typeof value === "number") {
      (next as Record<string, string | number>)[key] = value;
    }
  }
  return next;
}

export async function recordConnectorAuditEvent(
  client: SupabaseClient,
  input: {
    workspaceId: string;
    actorId: string;
    connectionId?: string | null;
    connectorId?: string | null;
    eventType: ConnectorAuditEventType;
    detail?: ConnectorAuditDetail;
  },
): Promise<void> {
  const detail = sanitizeAuditDetail(input.detail ?? {});
  const { error } = await client.from("connector_audit_events").insert({
    id: newAuditEventId(),
    workspace_id: input.workspaceId,
    actor_id: input.actorId,
    connection_id: input.connectionId ?? null,
    connector_id: input.connectorId ?? null,
    event_type: input.eventType,
    detail,
  });
  if (error) {
    console.warn("[cander] connector audit insert failed", error.message);
  }
}
