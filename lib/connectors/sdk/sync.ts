/**
 * ConnectorSync — runs adapter.sync() and persists domain rows.
 * No LLM / agent runtime.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../../supabase/admin.ts";
import { resolveConnectionForTool } from "../connections.ts";
import { getConnectorViewAdapter } from "./registry.ts";
import type { SyncResult } from "./types.ts";

export type RunConnectorSyncInput = {
  /** User-scoped client for connection resolution (RLS). */
  client: SupabaseClient;
  workspaceId: string;
  profileId: string;
  connectorId: string;
  connectionId?: string | null;
  limit?: number;
};

export type RunConnectorSyncResult =
  | {
      ok: true;
      connectionId: string;
      upserted: number;
      lastSyncedAt: string;
      sync: SyncResult;
    }
  | { ok: false; status: number; error: string };

function newMailRowId() {
  return `cm_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export async function runConnectorSync(
  input: RunConnectorSyncInput,
): Promise<RunConnectorSyncResult> {
  const adapter = getConnectorViewAdapter(input.connectorId);
  if (!adapter?.capabilities.sync) {
    return {
      ok: false,
      status: 400,
      error: `Sync is not available for ${input.connectorId}.`,
    };
  }

  const resolved = await resolveConnectionForTool({
    client: input.client,
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    connectorId: input.connectorId,
    connectionId: input.connectionId,
  });
  if (!resolved.ok) {
    return { ok: false, status: resolved.status, error: resolved.error };
  }

  const connection = resolved.connection;
  const admin = createSupabaseAdminClient();

  const { data: existingState } = await admin
    .from("connector_sync_state")
    .select("cursor, provider_state")
    .eq("connection_id", connection.connectionId)
    .maybeSingle();

  await admin.from("connector_sync_state").upsert(
    {
      connection_id: connection.connectionId,
      workspace_id: input.workspaceId,
      owner_id: input.profileId,
      connector_id: input.connectorId,
      status: "running",
      last_error: null,
      updated_at: new Date().toISOString(),
      cursor: existingState?.cursor ?? null,
      provider_state: existingState?.provider_state ?? {},
    },
    { onConflict: "connection_id" },
  );

  try {
    const sync = await adapter.sync({
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      connectionId: connection.connectionId,
      connectorId: input.connectorId,
      providerConnectionId: connection.providerConnectionId,
      cursor:
        typeof existingState?.cursor === "string" ? existingState.cursor : null,
      providerState:
        existingState?.provider_state &&
        typeof existingState.provider_state === "object"
          ? (existingState.provider_state as Record<string, unknown>)
          : {},
      limit: input.limit,
    });

    const now = new Date().toISOString();

    for (const header of sync.upserted) {
      const { data: existing } = await admin
        .from("connector_mail_messages")
        .select("id")
        .eq("connection_id", connection.connectionId)
        .eq("provider_message_id", header.providerMessageId)
        .maybeSingle();

      const row = {
        connection_id: connection.connectionId,
        workspace_id: input.workspaceId,
        owner_id: input.profileId,
        connector_id: input.connectorId,
        provider_message_id: header.providerMessageId,
        thread_id: header.threadId ?? null,
        from_addr: header.fromAddr ?? null,
        to_addrs: header.toAddrs ?? [],
        cc_addrs: header.ccAddrs ?? [],
        subject: header.subject ?? null,
        snippet: header.snippet ?? null,
        received_at: header.receivedAt ?? null,
        is_unread: Boolean(header.isUnread),
        is_archived: Boolean(header.isArchived),
        has_attachments: Boolean(header.hasAttachments),
        raw_meta: header.rawMeta ?? {},
        updated_at: now,
      };

      if (existing?.id) {
        await admin
          .from("connector_mail_messages")
          .update(row)
          .eq("id", existing.id);
      } else {
        await admin.from("connector_mail_messages").insert({
          id: newMailRowId(),
          ...row,
          created_at: now,
        });
      }
    }

    await admin.from("connector_sync_state").upsert(
      {
        connection_id: connection.connectionId,
        workspace_id: input.workspaceId,
        owner_id: input.profileId,
        connector_id: input.connectorId,
        cursor: sync.cursor ?? now,
        provider_state: sync.providerState ?? {},
        last_synced_at: now,
        last_error: null,
        status: "idle",
        updated_at: now,
      },
      { onConflict: "connection_id" },
    );

    await admin
      .from("connector_connections")
      .update({ last_sync_at: now, updated_at: now })
      .eq("id", connection.connectionId)
      .eq("owner_id", input.profileId);

    return {
      ok: true,
      connectionId: connection.connectionId,
      upserted: sync.upserted.length,
      lastSyncedAt: now,
      sync,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed.";
    await admin
      .from("connector_sync_state")
      .update({
        status: "error",
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("connection_id", connection.connectionId);
    return { ok: false, status: 500, error: message };
  }
}
