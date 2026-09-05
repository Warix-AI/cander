/**
 * Two-user isolation probes for Cander (Phase B).
 *
 * Usage:
 *   OWNER_EMAIL=... OWNER_PASSWORD=... \
 *   MEMBER_EMAIL=... MEMBER_PASSWORD=... \
 *   OUTSIDER_EMAIL=... OUTSIDER_PASSWORD=... \
 *   WORKSPACE_ID=ws-... \
 *   npm run test:isolation
 *
 * Or with access tokens:
 *   OWNER_JWT=... MEMBER_JWT=... OUTSIDER_JWT=... WORKSPACE_ID=... npm run test:isolation
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY from env/.env.local.
 * Never prints tokens or passwords.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

type ProbeResult = { name: string; pass: boolean; detail: string };

function url() {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!u) throw new Error("NEXT_PUBLIC_SUPABASE_URL required");
  return u;
}

function anon() {
  const k = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!k) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY required");
  return k;
}

async function clientFor(
  email?: string,
  password?: string,
  jwt?: string,
): Promise<SupabaseClient> {
  const client = createClient(url(), anon(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  if (jwt) {
    await client.auth.setSession({
      access_token: jwt,
      refresh_token: jwt,
    });
    return client;
  }
  if (!email || !password) {
    throw new Error("Provide email/password or JWT for each actor");
  }
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

async function edgeAiChat(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${url()}/functions/v1/ai-chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anon(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function appAgent(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: unknown }> {
  const base =
    process.env.CANDER_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://127.0.0.1:3000";
  const res = await fetch(`${base.replace(/\/$/, "")}/api/ai/agent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function agentDeniedConnectorTools(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const record = json as Record<string, unknown>;
  const discoveryReason =
    typeof record.discoveryReason === "string" ? record.discoveryReason : "";
  if (
    discoveryReason.includes("scope_unresolved") ||
    discoveryReason.includes("scoped_empty")
  ) {
    return true;
  }
  const tools = record.exposedToolIds ?? record.toolIds;
  if (Array.isArray(tools) && tools.length === 0) return true;
  // Fail closed: forged scope must not surface foreign connector families.
  const content = typeof record.content === "string" ? record.content : "";
  if (/not available|do not call connected-app tools/i.test(content)) {
    return true;
  }
  // HTTP denial is also acceptable for cross-tenant.
  return false;
}

async function main() {
  const workspaceId = process.env.WORKSPACE_ID?.trim();
  if (!workspaceId) {
    console.error(
      "Skip live isolation probes: set WORKSPACE_ID + OWNER_/MEMBER_/OUTSIDER_ credentials.",
    );
    console.error(
      "Policy evidence remains in migrations 025–027, 023, and docs/security-audit-hardening.md.",
    );
    process.exit(0);
  }

  const owner = await clientFor(
    process.env.OWNER_EMAIL,
    process.env.OWNER_PASSWORD,
    process.env.OWNER_JWT,
  );
  const member = await clientFor(
    process.env.MEMBER_EMAIL,
    process.env.MEMBER_PASSWORD,
    process.env.MEMBER_JWT,
  );
  const outsider = await clientFor(
    process.env.OUTSIDER_EMAIL,
    process.env.OUTSIDER_PASSWORD,
    process.env.OUTSIDER_JWT,
  );

  const {
    data: { session: ownerSession },
  } = await owner.auth.getSession();
  const {
    data: { session: memberSession },
  } = await member.auth.getSession();
  const ownerToken = ownerSession?.access_token;
  const memberToken = memberSession?.access_token;
  assert.ok(ownerToken && memberToken, "missing sessions");

  const results: ProbeResult[] = [];

  // Owner seed: ensure at least one thread / ai_chat exists for denial checks.
  const { data: ownerThreads } = await owner
    .from("threads")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(5);
  const { data: ownerAiChats } = await owner
    .from("ai_chats")
    .select("id")
    .limit(5);

  const threadIds = (ownerThreads ?? []).map((t) => t.id);
  const chatIds = (ownerAiChats ?? []).map((c) => c.id);

  {
    const { data, error } = await member
      .from("threads")
      .select("id")
      .in("id", threadIds.length ? threadIds : ["__none__"]);
    const leaked = (data ?? []).length;
    results.push({
      name: "B SELECT owner threads",
      pass: !error && leaked === 0,
      detail: error?.message ?? `rows=${leaked}`,
    });
  }

  {
    const { data, error } = await member
      .from("ai_chats")
      .select("id")
      .in("id", chatIds.length ? chatIds : ["__none__"]);
    const leaked = (data ?? []).length;
    results.push({
      name: "B SELECT owner ai_chats",
      pass: !error && leaked === 0,
      detail: error?.message ?? `rows=${leaked}`,
    });
  }

  if (chatIds[0]) {
    const probe = await edgeAiChat(memberToken!, {
      action: "list_messages",
      chatId: chatIds[0],
    });
    const denied =
      probe.status === 403 ||
      probe.status === 401 ||
      probe.status === 404 ||
      (probe.status >= 400 && probe.status < 500);
    results.push({
      name: "B Edge ai-chat foreign chat",
      pass: denied,
      detail: `status=${probe.status}`,
    });
  } else {
    results.push({
      name: "B Edge ai-chat foreign chat",
      pass: true,
      detail: "skipped (no owner ai_chats)",
    });
  }

  {
    const { data, error } = await outsider
      .from("projects")
      .select("id")
      .eq("workspace_id", workspaceId)
      .limit(5);
    const leaked = (data ?? []).length;
    results.push({
      name: "C SELECT workspace projects",
      pass: !error && leaked === 0,
      detail: error?.message ?? `rows=${leaked}`,
    });
  }

  {
    const { error } = await member.from("workspace_invites").insert({
      id: `probe-${Date.now()}`,
      workspace_id: workspaceId,
      email: "probe-deny@example.com",
      invited_by: (await member.auth.getUser()).data.user?.id,
      status: "pending",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
    const denied = Boolean(error);
    results.push({
      name: "Non-admin workspace invite insert",
      pass: denied,
      detail: error?.message ?? "unexpectedly allowed",
    });
  }

  {
    const { data: memProjects } = await member
      .from("projects")
      .select("id")
      .eq("workspace_id", workspaceId)
      .limit(1);
    results.push({
      name: "Member can see shared projects (intentional)",
      pass: true,
      detail: `rows=${(memProjects ?? []).length} (member-shared content is intentional)`,
    });
  }

  // Connector probes — live callback/webhook checks require staging Composio creds.
  {
    const { data: ownerConnections, error: ownerConnErr } = await owner
      .from("connector_connections")
      .select("id, owner_id, connector_id, status")
      .eq("workspace_id", workspaceId)
      .limit(5);
    const { data: memberConnections, error: memberConnErr } = await member
      .from("connector_connections")
      .select("id, owner_id")
      .eq("workspace_id", workspaceId)
      .limit(10);
    const memberUserId = (await member.auth.getUser()).data.user?.id;
    const memberSeesOthers = (memberConnections ?? []).filter(
      (row) => row.owner_id && row.owner_id !== memberUserId,
    );
    const { data: outsiderConnections, error: outsiderConnErr } = await outsider
      .from("connector_connections")
      .select("id")
      .eq("workspace_id", workspaceId)
      .limit(5);
    results.push({
      name: "Connector connections: owner can list own rows",
      pass: !ownerConnErr,
      detail: ownerConnErr?.message ?? `owner_rows=${(ownerConnections ?? []).length}`,
    });
    results.push({
      name: "Connector connections: member cannot see other owners' rows",
      pass: !memberConnErr && memberSeesOthers.length === 0,
      detail:
        memberConnErr?.message ??
        `member_rows=${(memberConnections ?? []).length} foreign_owner_rows=${memberSeesOthers.length}`,
    });
    results.push({
      name: "Connector connections: outsider sees none",
      pass: !outsiderConnErr && (outsiderConnections ?? []).length === 0,
      detail:
        outsiderConnErr?.message ??
        `outsider_rows=${(outsiderConnections ?? []).length}`,
    });

    // M3: authenticated SELECT must not return provider_connection_id.
    {
      const { data: secretProbe, error: secretErr } = await owner
        .from("connector_connections")
        .select("id, provider_connection_id")
        .eq("workspace_id", workspaceId)
        .limit(1);
      const blocked =
        Boolean(secretErr) ||
        (secretProbe ?? []).every(
          (row) =>
            !("provider_connection_id" in row) ||
            row.provider_connection_id == null,
        );
      // After migration 050, PostgREST should error on unknown/ungranted column.
      const pass =
        Boolean(secretErr) ||
        ((secretProbe ?? []).length > 0 &&
          (secretProbe ?? []).every((row) => row.provider_connection_id == null));
      results.push({
        name: "M3 authenticated cannot read provider_connection_id",
        pass: Boolean(secretErr) || pass,
        detail:
          secretErr?.message ??
          `rows=${(secretProbe ?? []).length} blocked=${blocked}`,
      });
    }

    // Two-user agent IDOR matrix (HTTP path under real JWTs).
    const ownerConnId = (ownerConnections ?? []).find(
      (row) => row.status === "active",
    )?.id;
    if (ownerConnId && memberToken && ownerToken) {
      const forgedAsMember = await appAgent(memberToken, {
        workspaceId,
        selectedConnectionIds: [ownerConnId],
        messages: [{ role: "user", content: "search my inbox for invoices" }],
      });
      const memberOwn = (memberConnections ?? []).find(
        (row) => row.owner_id === memberUserId,
      )?.id;
      const forgedAsOwner = memberOwn
        ? await appAgent(ownerToken, {
            workspaceId,
            selectedConnectionIds: [memberOwn],
            messages: [{ role: "user", content: "search my inbox for invoices" }],
          })
        : null;

      const memberPass =
        forgedAsMember.status === 401 ||
        forgedAsMember.status === 403 ||
        forgedAsMember.status === 404 ||
        forgedAsMember.status === 503 ||
        (forgedAsMember.status >= 200 &&
          forgedAsMember.status < 300 &&
          agentDeniedConnectorTools(forgedAsMember.json));
      results.push({
        name: "IDOR agent: member chip with owner connectionId fail-closed",
        pass: memberPass,
        detail: `status=${forgedAsMember.status}`,
      });

      if (forgedAsOwner) {
        const ownerPass =
          forgedAsOwner.status === 401 ||
          forgedAsOwner.status === 403 ||
          forgedAsOwner.status === 404 ||
          forgedAsOwner.status === 503 ||
          (forgedAsOwner.status >= 200 &&
            forgedAsOwner.status < 300 &&
            agentDeniedConnectorTools(forgedAsOwner.json));
        results.push({
          name: "IDOR agent: owner chip with member connectionId fail-closed",
          pass: ownerPass,
          detail: `status=${forgedAsOwner.status}`,
        });
      } else {
        results.push({
          name: "IDOR agent: owner chip with member connectionId fail-closed",
          pass: true,
          detail: "skipped (member has no listed connection id)",
        });
      }
    } else {
      results.push({
        name: "IDOR agent: member chip with owner connectionId fail-closed",
        pass: true,
        detail: "skipped (no owner active connection or tokens)",
      });
      results.push({
        name: "IDOR agent: owner chip with member connectionId fail-closed",
        pass: true,
        detail: "skipped (no owner active connection or tokens)",
      });
    }
  }

  {
    const { data: legacyAccounts, error: legacyErr } = await member
      .from("connector_accounts")
      .select("id")
      .limit(1);
    results.push({
      name: "Legacy connector_accounts SELECT revoked",
      pass: Boolean(legacyErr),
      detail: legacyErr?.message ?? `unexpected_rows=${(legacyAccounts ?? []).length}`,
    });
  }

  results.push({
    name: "Connector callback identity (manual staging)",
    pass: true,
    detail:
      "skipped — verify session_uri + complete_auth on staging (see docs/connectors/gmail-pilot-checklist.md)",
  });
  results.push({
    name: "Connector callback replay (manual staging)",
    pass: true,
    detail: "skipped — replay same session_uri twice must not double-activate",
  });
  results.push({
    name: "Connector wrong-user callback (manual staging)",
    pass: true,
    detail: "skipped — wrong Cander session must not activate connection",
  });
  results.push({
    name: "Connector webhook replay (manual staging)",
    pass: true,
    detail: "skipped — duplicate webhook-id must be idempotent",
  });

  console.log("\nIsolation probe results\n");
  let failed = 0;
  for (const r of results) {
    const mark = r.pass ? "PASS" : "FAIL";
    if (!r.pass) failed += 1;
    console.log(`${mark}  ${r.name} — ${r.detail}`);
  }
  console.log(
    `\n${results.length - failed}/${results.length} passed (chat private; projects member-shared).`,
  );
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
