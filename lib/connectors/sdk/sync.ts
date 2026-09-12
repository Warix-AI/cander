/**
 * ConnectorSync — runs adapter.sync() and persists domain rows.
 * Detects genuinely new mail, then wakes Expert routing (no AI in sync itself).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../../supabase/admin.ts";
import { resolveConnectionForTool } from "../connections.ts";
import { getConnectorViewAdapter } from "./registry.ts";
import type { SyncMessageHeader, SyncResult } from "./types.ts";
import { dispatchNewMailToExperts } from "@/lib/agents/connector-events";

export type RunConnectorSyncInput = {
  /** User-scoped client for connection resolution (RLS). */
  client: SupabaseClient;
  workspaceId: string;
  profileId: string;
  connectorId: string;
  connectionId?: string | null;
  limit?: number;
  /** interactive = user Refresh — adapters may trim work for latency. */
  priority?: "interactive" | "background";
  /** When false, skip Expert routing (tests / dry-run). Default true. */
  routeToExperts?: boolean;
};

export type RunConnectorSyncResult =
  | {
      ok: true;
      connectionId: string;
      upserted: number;
      newMessages: number;
      lastSyncedAt: string;
      sync: SyncResult;
      expertDispatches?: Awaited<ReturnType<typeof dispatchNewMailToExperts>>;
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
      priority: input.priority ?? "background",
    });

    const now = new Date().toISOString();
    let newHeaders: SyncMessageHeader[] = [];

    if (sync.upserted.length) {
      const providerIds = sync.upserted.map((h) => h.providerMessageId);
      const { data: existingRows } = await admin
        .from("connector_mail_messages")
        .select("id, provider_message_id")
        .eq("connection_id", connection.connectionId)
        .in("provider_message_id", providerIds);

      const idByProvider = new Map<string, string>();
      for (const row of existingRows || []) {
        if (row?.provider_message_id && row?.id) {
          idByProvider.set(String(row.provider_message_id), String(row.id));
        }
      }

      newHeaders = sync.upserted.filter(
        (header) => !idByProvider.has(header.providerMessageId),
      );

      const rows = sync.upserted.map((header) => ({
        id: idByProvider.get(header.providerMessageId) ?? newMailRowId(),
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
      }));

      // One round-trip instead of select+write per message.
      // Omit body_* so lazy-fetched bodies are preserved on conflict.
      const { error: upsertError } = await admin
        .from("connector_mail_messages")
        .upsert(rows, { onConflict: "connection_id,provider_message_id" });
      if (upsertError) {
        throw new Error(upsertError.message || "Failed to persist mail sync.");
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

    let expertDispatches:
      | Awaited<ReturnType<typeof dispatchNewMailToExperts>>
      | undefined;

    if (
      input.routeToExperts !== false &&
      input.connectorId === "gmail" &&
      newHeaders.length
    ) {
      expertDispatches = [];
      // Cap concurrent Expert wakes per sync pass.
      const batch = newHeaders.slice(0, 5);
      for (const message of batch) {
        try {
          const dispatched = await dispatchNewMailToExperts({
            workspaceId: input.workspaceId,
            profileId: input.profileId,
            connectionId: connection.connectionId,
            connectorId: input.connectorId,
            message,
          });
          expertDispatches.push(...dispatched);
        } catch (err) {
          console.warn(
            "[connectors] expert dispatch failed:",
            err instanceof Error ? err.message : err,
          );
          expertDispatches.push({
            providerMessageId: message.providerMessageId,
            projectId: "",
            consulted: false,
            reason:
              err instanceof Error ? err.message : "Expert dispatch failed.",
          });
        }
      }
    }

    return {
      ok: true,
      connectionId: connection.connectionId,
      upserted: sync.upserted.length,
      newMessages: newHeaders.length,
      lastSyncedAt: now,
      sync,
      ...(expertDispatches ? { expertDispatches } : {}),
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
