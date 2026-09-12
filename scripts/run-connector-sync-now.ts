/**
 * One-off / ops: run Gmail connector sync + Expert routing immediately.
 * Usage: npx tsx scripts/run-connector-sync-now.ts
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { runConnectorSync } from "../lib/connectors/sdk/sync.ts";
import "../lib/connectors/sdk/registry.ts";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2]!.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (!process.env[m[1]!]) process.env[m[1]!] = v;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase admin env");

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: connections, error } = await admin
    .from("connector_connections")
    .select("id, workspace_id, owner_id, connector_id, last_sync_at")
    .eq("status", "active")
    .eq("connector_id", "gmail")
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(12);
  if (error) throw new Error(error.message);

  console.log("now", new Date().toISOString());
  console.log("connections", connections?.length ?? 0);

  for (const row of connections ?? []) {
    const connectionId = String(row.id);
    console.log("syncing", connectionId, "prev_last_sync", row.last_sync_at);
    const result = await runConnectorSync({
      client: admin,
      workspaceId: String(row.workspace_id),
      profileId: String(row.owner_id),
      connectorId: String(row.connector_id),
      connectionId,
      priority: "interactive",
      limit: 30,
      routeToExperts: true,
    });
    console.log(JSON.stringify(result, null, 2));
  }

  const { data: mail } = await admin
    .from("connector_mail_messages")
    .select("provider_message_id, subject, from_addr, received_at, created_at")
    .eq("connection_id", connections?.[0]?.id ?? "")
    .order("created_at", { ascending: false })
    .limit(5);
  console.log("latest_stored_mail", mail);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
