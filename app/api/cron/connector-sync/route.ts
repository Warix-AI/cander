/**
 * POST /api/cron/connector-sync
 * Background Gmail (and other syncable) connector sync without the UI open.
 * Detects new messages via runConnectorSync → Expert routing.
 */

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runConnectorSync } from "@/lib/connectors/sdk/sync";
import "@/lib/connectors/sdk/registry";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = request.headers.get("x-cron-secret")?.trim() || "";
  return bearer === secret || headerSecret === secret;
}

export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: connections, error } = await admin
    .from("connector_connections")
    .select("id, workspace_id, owner_id, connector_id")
    .eq("status", "active")
    .eq("connector_id", "gmail")
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(12);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{
    connectionId: string;
    ok: boolean;
    newMessages?: number;
    consulted?: number;
    error?: string;
  }> = [];

  for (const row of connections ?? []) {
    const connectionId = String(row.id);
    const workspaceId = String(row.workspace_id);
    const profileId = String(row.owner_id);
    const connectorId = String(row.connector_id);
    try {
      const result = await runConnectorSync({
        client: admin,
        workspaceId,
        profileId,
        connectorId,
        connectionId,
        priority: "background",
        limit: 30,
        routeToExperts: true,
      });
      if (!result.ok) {
        results.push({
          connectionId,
          ok: false,
          error: result.error,
        });
        continue;
      }
      const consulted = (result.expertDispatches ?? []).filter(
        (d) => d.consulted,
      ).length;
      results.push({
        connectionId,
        ok: true,
        newMessages: result.newMessages,
        consulted,
      });
    } catch (err) {
      results.push({
        connectionId,
        ok: false,
        error: err instanceof Error ? err.message : "failed",
      });
    }
  }

  return NextResponse.json({
    scanned: connections?.length ?? 0,
    results,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
