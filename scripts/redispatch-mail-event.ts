/**
 * One-off: re-dispatch a synced Gmail message that missed Expert routing.
 * Usage: npx tsx scripts/redispatch-mail-event.ts <providerMessageId>
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { dispatchNewMailToExperts } from "../lib/agents/connector-events.ts";

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
  const mid = process.argv[2]?.trim();
  if (!mid) throw new Error("providerMessageId required");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase admin env");

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: mail, error } = await sb
    .from("connector_mail_messages")
    .select("*")
    .eq("provider_message_id", mid)
    .single();
  if (error || !mail) throw new Error(error?.message || "Mail not found");

  const results = await dispatchNewMailToExperts({
    workspaceId: String(mail.workspace_id),
    profileId: String(mail.owner_id),
    connectionId: String(mail.connection_id),
    connectorId: "gmail",
    message: {
      providerMessageId: String(mail.provider_message_id),
      threadId: mail.thread_id ? String(mail.thread_id) : null,
      fromAddr: mail.from_addr ? String(mail.from_addr) : null,
      toAddrs: Array.isArray(mail.to_addrs)
        ? mail.to_addrs.map(String)
        : [],
      subject: mail.subject ? String(mail.subject) : null,
      snippet: mail.snippet ? String(mail.snippet) : null,
      receivedAt: mail.received_at ? String(mail.received_at) : null,
    },
  });
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
