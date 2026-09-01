import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractConnectedAccountFields,
  verifyComposioWebhook,
} from "../lib/connectors/composio-webhook.ts";
import { signComposioWebhook } from "../lib/connectors/composio-webhook-sign.ts";
import {
  allowedPostVerifyRedirectPaths,
} from "../lib/connectors/composio-http.ts";
import {
  consumeOAuthStateById,
  findValidPendingOAuthStateForOwner,
  isOAuthStateExpired,
} from "../lib/connectors/oauth-state.ts";

const SECRET = "whsec_test_secret_value_12345";

function signedHeaders(input: {
  payload: string;
  webhookId?: string;
  timestamp?: string;
  secret?: string;
  tamperBody?: boolean;
  omit?: Array<"id" | "timestamp" | "signature">;
}) {
  const webhookId = input.webhookId ?? "msg_test_123";
  const timestamp =
    input.timestamp ?? String(Math.floor(Date.now() / 1000));
  const payload = input.tamperBody ? `${input.payload}x` : input.payload;
  const signature = signComposioWebhook({
    webhookId,
    webhookTimestamp: timestamp,
    payload,
    secret: input.secret ?? SECRET,
  });
  const headers = new Headers({
    "content-type": "application/json",
    "webhook-id": webhookId,
    "webhook-timestamp": timestamp,
    "webhook-signature": signature,
  });
  if (input.omit?.includes("id")) headers.delete("webhook-id");
  if (input.omit?.includes("timestamp")) headers.delete("webhook-timestamp");
  if (input.omit?.includes("signature")) headers.delete("webhook-signature");
  return { headers, payload: input.payload, webhookId, timestamp };
}

test("extractConnectedAccountFields reads connected account id and status", () => {
  const fields = extractConnectedAccountFields({
    type: "composio.connected_account.expired",
    data: {
      id: "ca_test_abc",
      status: "EXPIRED",
      user_id: "cander:ws:user",
    },
  });
  assert.equal(fields.connectedAccountId, "ca_test_abc");
  assert.equal(fields.status, "EXPIRED");
  assert.equal(fields.composioUserId, "cander:ws:user");
});

test("verifyComposioWebhook accepts valid official signature", async () => {
  const payload = JSON.stringify({
    id: "msg_test_123",
    timestamp: new Date().toISOString(),
    type: "composio.connected_account.expired",
    metadata: { project_id: "proj_test", org_id: "org_test" },
    data: {
      id: "ca_1",
      status: "EXPIRED",
      user_id: "cander:ws:u",
    },
  });
  const { headers } = signedHeaders({ payload });
  const result = await verifyComposioWebhook({
    rawBody: payload,
    headers,
    secret: SECRET,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.parsed.eventId, "msg_test_123");
    assert.equal(result.parsed.connectedAccountId, "ca_1");
  }
});

test("verifyComposioWebhook rejects invalid signature", async () => {
  const payload = JSON.stringify({ type: "event", data: { id: "ca_1" } });
  const { headers } = signedHeaders({ payload, secret: "wrong-secret" });
  const result = await verifyComposioWebhook({
    rawBody: payload,
    headers,
    secret: SECRET,
  });
  assert.equal(result.ok, false);
});

test("verifyComposioWebhook rejects missing signature headers", async () => {
  const payload = JSON.stringify({ type: "event" });
  const { headers } = signedHeaders({ payload, omit: ["signature"] });
  const result = await verifyComposioWebhook({
    rawBody: payload,
    headers,
    secret: SECRET,
  });
  assert.equal(result.ok, false);
});

test("verifyComposioWebhook rejects altered raw body", async () => {
  const payload = JSON.stringify({
    id: "msg_test_123",
    timestamp: new Date().toISOString(),
    type: "composio.connected_account.expired",
    metadata: {},
    data: { id: "ca_1", status: "EXPIRED" },
  });
  const { headers } = signedHeaders({ payload, tamperBody: true });
  const result = await verifyComposioWebhook({
    rawBody: payload,
    headers,
    secret: SECRET,
  });
  assert.equal(result.ok, false);
});

test("verifyComposioWebhook rejects expired timestamp", async () => {
  const payload = JSON.stringify({
    id: "msg_test_123",
    timestamp: new Date().toISOString(),
    type: "composio.connected_account.expired",
    metadata: {},
    data: { id: "ca_1", status: "EXPIRED" },
  });
  const stale = String(Math.floor(Date.now() / 1000) - 3600);
  const { headers } = signedHeaders({ payload, timestamp: stale });
  const result = await verifyComposioWebhook({
    rawBody: payload,
    headers,
    secret: SECRET,
  });
  assert.equal(result.ok, false);
});

test("post-verify redirect allowlist blocks open redirects", () => {
  const allowed = allowedPostVerifyRedirectPaths();
  const next = "//evil.example/phish";
  const safe = allowed.some(
    (prefix) => next === prefix || next.startsWith(`${prefix}?`),
  );
  assert.equal(safe, false);
  assert.equal(
    allowed.some(
      (prefix) => "/work" === prefix || "/work".startsWith(`${prefix}?`),
    ),
    true,
  );
});

test("oauth state expiry detection", () => {
  assert.equal(
    isOAuthStateExpired({ expires_at: new Date(Date.now() - 1000).toISOString() }),
    true,
  );
});

test("findValidPendingOAuthStateForOwner is exported for callback pre-checks", () => {
  assert.equal(typeof findValidPendingOAuthStateForOwner, "function");
  assert.equal(typeof consumeOAuthStateById, "function");
});
