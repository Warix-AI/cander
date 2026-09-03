import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { resolveConnectorRequest } from "@/lib/connectors/server-context";
import { resolveConnectionForTool } from "@/lib/connectors/connections";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureMailBodyCached } from "@/lib/connectors/sdk/operations";
import "@/lib/connectors/sdk/registry";

export const runtime = "nodejs";

export type MailListItem = {
  id: string;
  providerMessageId: string;
  threadId: string | null;
  fromAddr: string | null;
  toAddrs: string[];
  subject: string | null;
  snippet: string | null;
  receivedAt: string | null;
  isUnread: boolean;
  isArchived: boolean;
  hasAttachments: boolean;
  hasBody: boolean;
};

/**
 * List / detail mail from local synced rows (not live Gmail on every open).
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const connectorId = url.searchParams.get("connectorId")?.trim() || "gmail";
  const connectionIdParam = url.searchParams.get("connectionId");
  const messageId = url.searchParams.get("messageId")?.trim();
  const includeArchived = url.searchParams.get("includeArchived") === "1";
  const fetchBody = url.searchParams.get("fetchBody") !== "0";

  const ctx = await resolveConnectorRequest({ request, workspaceId });
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const resolved = await resolveConnectionForTool({
    client: ctx.client,
    workspaceId: ctx.workspaceId,
    profileId: ctx.user.id,
    connectorId,
    connectionId: connectionIdParam,
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const connectionId = resolved.connection.connectionId;
  const admin = createSupabaseAdminClient();

  if (messageId) {
    const { data: row, error } = await admin
      .from("connector_mail_messages")
      .select(
        "id, provider_message_id, thread_id, from_addr, to_addrs, cc_addrs, subject, snippet, received_at, is_unread, is_archived, has_attachments, body_text, body_html, body_fetched_at",
      )
      .eq("connection_id", connectionId)
      .eq("provider_message_id", messageId)
      .eq("owner_id", ctx.user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    let bodyText = row.body_text as string | null;
    let bodyHtml = row.body_html as string | null;
    if (fetchBody && !row.body_fetched_at) {
      const cached = await ensureMailBodyCached({
        client: ctx.client,
        workspaceId: ctx.workspaceId,
        profileId: ctx.user.id,
        connectorId,
        connectionId,
        providerMessageId: messageId,
      });
      if (cached.ok) {
        bodyText = cached.bodyText;
        bodyHtml = cached.bodyHtml;
      }
    }

    return NextResponse.json({
      ok: true,
      connectionId,
      message: {
        id: row.id,
        providerMessageId: row.provider_message_id,
        threadId: row.thread_id,
        fromAddr: row.from_addr,
        toAddrs: row.to_addrs ?? [],
        ccAddrs: row.cc_addrs ?? [],
        subject: row.subject,
        snippet: row.snippet,
        receivedAt: row.received_at,
        isUnread: row.is_unread,
        isArchived: row.is_archived,
        hasAttachments: row.has_attachments,
        bodyText,
        bodyHtml,
        hasBody: Boolean(bodyText || bodyHtml),
      },
    });
  }

  let query = admin
    .from("connector_mail_messages")
    .select(
      "id, provider_message_id, thread_id, from_addr, to_addrs, subject, snippet, received_at, is_unread, is_archived, has_attachments, body_fetched_at",
    )
    .eq("connection_id", connectionId)
    .eq("owner_id", ctx.user.id)
    .order("received_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (!includeArchived) {
    query = query.eq("is_archived", false);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const messages: MailListItem[] = (data ?? []).map((row) => ({
    id: row.id as string,
    providerMessageId: row.provider_message_id as string,
    threadId: (row.thread_id as string | null) ?? null,
    fromAddr: (row.from_addr as string | null) ?? null,
    toAddrs: (row.to_addrs as string[]) ?? [],
    subject: (row.subject as string | null) ?? null,
    snippet: (row.snippet as string | null) ?? null,
    receivedAt: (row.received_at as string | null) ?? null,
    isUnread: Boolean(row.is_unread),
    isArchived: Boolean(row.is_archived),
    hasAttachments: Boolean(row.has_attachments),
    hasBody: Boolean(row.body_fetched_at),
  }));

  const { data: syncState } = await admin
    .from("connector_sync_state")
    .select("last_synced_at, status, last_error")
    .eq("connection_id", connectionId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    connectionId,
    messages,
    sync: {
      lastSyncedAt: syncState?.last_synced_at ?? null,
      status: syncState?.status ?? "idle",
      lastError: syncState?.last_error ?? null,
    },
  });
}
