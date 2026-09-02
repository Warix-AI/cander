import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatGmailToolOutput,
  GMAIL_COMPOSIO_SLUGS,
  mapGmailToolArguments,
  redactComposioPayload,
} from "../lib/connectors/composio-tools.ts";
import { authorizeConnectorToolAction } from "../lib/connectors/tool-authz.ts";
import { isCommsConnectorIntent } from "../lib/ai/tools/domains.ts";
import {
  inferSendMailFromThread,
  isCommsConnectorTurn,
  looksLikeSendFollowUp,
  looksLikeSendIntent,
  threadIsActiveEmailConversation,
} from "../lib/ai/connectors/comms-intent.ts";
import { enabledToolIds } from "../lib/connectors/tool-catalog.ts";
import { getAiTool } from "../lib/ai/tools/registry.ts";

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
  assert.deepEqual(
    mapGmailToolArguments("gmail.draft", {
      to: "alice@example.com",
      subject: "Draft",
      body: "Later",
    }),
    {
      recipient_email: "alice@example.com",
      subject: "Draft",
      body: "Later",
    },
  );
  assert.deepEqual(
    mapGmailToolArguments("gmail.reply", {
      threadId: "thr_1",
      body: "Thanks!",
      to: "alice@example.com",
    }),
    {
      thread_id: "thr_1",
      message_body: "Thanks!",
      recipient_email: "alice@example.com",
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

test("isCommsConnectorTurn routes send-it follow-ups with email context", () => {
  const thread = [
    {
      role: "user",
      content: "Draft an email to matt@warix.co about Cander",
    },
    {
      role: "assistant",
      content: `To: matt@warix.co
Subject: Check out my new app, Cander

Hey Matt,

I'd love for you to check out this new app that I've been building.

Best, Alex`,
    },
  ];
  assert.equal(isCommsConnectorTurn("send it", thread), true);
  assert.equal(
    isCommsConnectorTurn("Well, why weren't you able to see the send tool before?", thread),
    true,
  );
  assert.equal(isCommsConnectorTurn("Are there any sports going on", thread), false);
});

test("looksLikeSendIntent matches capability nudges", () => {
  assert.equal(
    looksLikeSendIntent(
      "Are you sure you can't send any emails? Try through the same paths that you were able to read my last email.",
    ),
    true,
  );
  assert.equal(looksLikeSendIntent("What's the weather today?"), false);
});

test("threadIsActiveEmailConversation stays sticky after a draft", () => {
  const thread = [
    { role: "user", content: "Draft an email to matt@warix.co" },
    {
      role: "assistant",
      content: "To: matt@warix.co\nSubject: Hi\n\nHello there.",
    },
    { role: "user", content: "send it" },
    {
      role: "assistant",
      content: "Done — your email was sent to matt@warix.co.",
    },
  ];
  assert.equal(
    threadIsActiveEmailConversation(thread),
    true,
  );
});

test("looksLikeSendFollowUp matches common confirmations", () => {
  assert.equal(looksLikeSendFollowUp("send it"), true);
  assert.equal(looksLikeSendFollowUp("go ahead and send"), true);
  assert.equal(looksLikeSendFollowUp("check my inbox"), false);
});

test("gmail.send is discoverable by AI and mapped to Composio when write access is enabled", () => {
  const enabled = enabledToolIds("gmail", {
    "gmail.search": true,
    "gmail.read": true,
    "gmail.send": true,
  });
  assert.ok(enabled.includes("gmail.send"));
  const tool = getAiTool("gmail.send");
  assert.ok(tool?.enabled);
  assert.match(tool!.description, /Send an email via the user's connected Gmail/);
  assert.deepEqual(tool!.parameters.required, ["to", "subject", "body"]);
  assert.equal(GMAIL_COMPOSIO_SLUGS["gmail.send"], "GMAIL_SEND_EMAIL");
});

test("inferSendMailFromThread extracts draft from assistant message", () => {
  const draft = inferSendMailFromThread([
    {
      role: "assistant",
      content: `I can't send emails from here, but the approved message is ready to copy into your email client:

To: matt@warix.co
Subject: Check out my new app, Cander

Hey Matt,

Here's the link: https://cander.app

Best, Alex`,
    },
  ]);
  assert.ok(draft);
  assert.equal(draft?.to, "matt@warix.co");
  assert.equal(draft?.subject, "Check out my new app, Cander");
  assert.match(draft?.body ?? "", /Hey Matt/);
  assert.match(draft?.body ?? "", /cander\.app/);
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
