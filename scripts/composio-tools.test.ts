import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatGmailToolOutput,
  mapGmailToolArguments,
  redactComposioPayload,
} from "../lib/connectors/composio-tools.ts";
import { authorizeConnectorToolAction } from "../lib/connectors/tool-authz.ts";
import { isCommsConnectorIntent } from "../lib/ai/tools/domains.ts";

test("mapGmailToolArguments maps search, read, and send args", () => {
  assert.deepEqual(mapGmailToolArguments("gmail.search", { query: "is:unread" }), {
    query: "is:unread",
    max_results: 10,
  });
  assert.deepEqual(
    mapGmailToolArguments("gmail.search", {
      query: "from:alice",
      maxResults: 40,
    }),
    { query: "from:alice", max_results: 25 },
  );
  assert.deepEqual(
    mapGmailToolArguments("gmail.read", { messageId: "msg_123" }),
    { message_id: "msg_123" },
  );
  assert.deepEqual(
    mapGmailToolArguments("gmail.send", {
      to: "alice@example.com",
      subject: "Hi",
      body: "Hello",
    }),
    {
      recipient_email: "alice@example.com",
      subject: "Hi",
      body: "Hello",
    },
  );
});

test("redactComposioPayload strips secrets and truncates long strings", () => {
  const long = "a".repeat(9_000);
  const redacted = redactComposioPayload({
    access_token: "secret",
    body: long,
    nested: { refresh_token: "x", note: "ok" },
  }) as Record<string, unknown>;
  assert.equal("access_token" in redacted, false);
  assert.equal(typeof redacted.body, "string");
  assert.equal(String(redacted.body).endsWith("…"), true);
  assert.equal(
    (redacted.nested as Record<string, unknown>).refresh_token,
    undefined,
  );
});

test("formatGmailToolOutput summarizes search results without secrets", () => {
  const output = formatGmailToolOutput("gmail.search", {
    data: {
      messages: [
        {
          id: "msg_1",
          threadId: "thr_1",
          snippet: "Hello there",
          payload: {
            headers: [
              { name: "Subject", value: "Weekly update" },
              { name: "From", value: "alice@example.com" },
            ],
          },
        },
      ],
    },
    connected_account_id: "ca_secret",
  });
  const parsed = JSON.parse(output) as {
    count: number;
    messages: Array<Record<string, unknown>>;
  };
  assert.equal(parsed.count, 1);
  assert.equal(parsed.messages[0]?.id, "msg_1");
  assert.equal(parsed.messages[0]?.subject, "Weekly update");
  assert.equal("connected_account_id" in parsed, false);
});

test("isCommsConnectorIntent unlocks gmail email asks", () => {
  assert.equal(isCommsConnectorIntent("check my gmail inbox"), true);
  assert.equal(isCommsConnectorIntent("Are there any sports going on"), false);
});

test("formatGmailToolOutput summarizes send results", () => {
  const output = formatGmailToolOutput("gmail.send", {
    data: { id: "msg_sent_1", threadId: "thr_1" },
    connected_account_id: "secret",
  });
  const parsed = JSON.parse(output) as {
    outcome: string;
    sent: { id?: string; threadId?: string };
  };
  assert.equal(parsed.outcome, "ok");
  assert.equal(parsed.sent.id, "msg_sent_1");
  assert.equal(parsed.sent.threadId, "thr_1");
  assert.equal("connected_account_id" in parsed, false);
});

test("connector tool seam allows gmail.read and blocks send by default", () => {
  const allowed = authorizeConnectorToolAction({
    workspaceId: "ws",
    profileId: "11111111-1111-1111-1111-111111111111",
    connectorId: "gmail",
    toolName: "gmail.read",
    connectionId: "conn_1",
  });
  assert.equal(allowed.ok, true);

  const denied = authorizeConnectorToolAction({
    workspaceId: "ws",
    profileId: "11111111-1111-1111-1111-111111111111",
    connectorId: "gmail",
    toolName: "gmail.send",
    connectionId: "conn_1",
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.reason, "not_allowed");
});
