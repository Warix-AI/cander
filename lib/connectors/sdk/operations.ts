/**
 * ConnectorOperations — UI / automation / job mutations (not agent).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../../supabase/admin.ts";
import { resolveConnectionForTool } from "../connections.ts";
import { getConnectorViewAdapter } from "./registry.ts";
import type { ActionResult } from "./types.ts";

export type RunConnectorOperationInput = {
  client: SupabaseClient;
  workspaceId: string;
  profileId: string;
  connectorId: string;
  connectionId?: string | null;
  operation: string;
  input?: Record<string, unknown>;
};

export type RunConnectorOperationResult =
  | { ok: true; connectionId: string; result: ActionResult }
  | { ok: false; status: number; error: string };

export async function runConnectorOperation(
  input: RunConnectorOperationInput,
): Promise<RunConnectorOperationResult> {
  const adapter = getConnectorViewAdapter(input.connectorId);
  if (!adapter) {
    return {
      ok: false,
      status: 400,
      error: `No connector view adapter for ${input.connectorId}.`,
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
  const result = await adapter.executeAction(
    input.operation,
    input.input ?? {},
    {
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      connectionId: connection.connectionId,
      connectorId: input.connectorId,
      providerConnectionId: connection.providerConnectionId,
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      status: 400,
      error: result.error ?? "Operation failed.",
    };
  }

  // Mirror local flags after mutations when we know the message id.
  const messageId =
    typeof input.input?.messageId === "string"
      ? input.input.messageId
      : typeof input.input?.message_id === "string"
        ? input.input.message_id
        : null;

  if (messageId) {
    const admin = createSupabaseAdminClient();
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.operation === "archive") patch.is_archived = true;
    if (input.operation === "markRead") patch.is_unread = false;
    if (input.operation === "markUnread") patch.is_unread = true;
    if (Object.keys(patch).length > 1) {
      await admin
        .from("connector_mail_messages")
        .update(patch)
        .eq("connection_id", connection.connectionId)
        .eq("provider_message_id", messageId)
        .eq("owner_id", input.profileId);
    }
  }

  return {
    ok: true,
    connectionId: connection.connectionId,
    result,
  };
}

/**
 * Ensure a message body is cached locally (lazy fetch).
 */
export async function ensureMailBodyCached(input: {
  client: SupabaseClient;
  workspaceId: string;
  profileId: string;
  connectorId: string;
  connectionId: string;
  providerMessageId: string;
}): Promise<
  | {
      ok: true;
      bodyText: string | null;
      bodyHtml: string | null;
    }
  | { ok: false; status: number; error: string }
> {
  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from("connector_mail_messages")
    .select("id, body_text, body_html, body_fetched_at")
    .eq("connection_id", input.connectionId)
    .eq("provider_message_id", input.providerMessageId)
    .eq("owner_id", input.profileId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }
  if (!row) {
    return { ok: false, status: 404, error: "Message not found." };
  }

  if (row.body_fetched_at && (row.body_text || row.body_html)) {
    return {
      ok: true,
      bodyText: row.body_text ?? null,
      bodyHtml: row.body_html ?? null,
    };
  }

  const fetched = await runConnectorOperation({
    client: input.client,
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    connectorId: input.connectorId,
    connectionId: input.connectionId,
    operation: "readBody",
    input: { messageId: input.providerMessageId },
  });
  if (!fetched.ok) {
    return { ok: false, status: fetched.status, error: fetched.error };
  }

  const bodyText =
    typeof fetched.result.data?.bodyText === "string"
      ? fetched.result.data.bodyText
      : null;
  const bodyHtml =
    typeof fetched.result.data?.bodyHtml === "string"
      ? fetched.result.data.bodyHtml
      : null;
  const now = new Date().toISOString();

  await admin
    .from("connector_mail_messages")
    .update({
      body_text: bodyText,
      body_html: bodyHtml,
      body_fetched_at: now,
      updated_at: now,
    })
    .eq("id", row.id);

  return { ok: true, bodyText, bodyHtml };
}
