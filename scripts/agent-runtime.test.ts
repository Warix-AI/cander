/**
 * Agent runtime foundation tests — discovery, references, idempotency, snapshot prompt.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getCanderTool,
  listCanderToolsForConnector,
  listCanderToolsForFamily,
} from "../lib/ai/tools/cander-registry.ts";
import { discoverRelevantTools } from "../lib/ai/tools/discovery.ts";
import {
  canderToolToOpenAIFunction,
  fromOpenAIToolName,
  toOpenAIToolName,
} from "../lib/ai/tools/schemas.ts";
import {
  resolveOrdinalReference,
  suggestToolsForReference,
  formatReferencesForPrompt,
} from "../lib/ai/state/references.ts";
import { buildIdempotencyKey, isWriteRisk } from "../lib/ai/state/idempotency.ts";
import { formatCapabilitySnapshotForPrompt } from "../lib/ai/runtime/capability-context.ts";
import { authorizeConnectorToolAction } from "../lib/connectors/authorization.ts";
import { evaluateConfirmationRequirement } from "../lib/connectors/authorization.ts";
import type { CapabilitySnapshot } from "../lib/ai/tools/types.ts";

test("cander registry seeds gmail and slack tools", () => {
  assert.ok(getCanderTool("gmail.send"));
  assert.equal(getCanderTool("gmail.send")?.risk, "write");
  assert.equal(getCanderTool("gmail.send")?.confirmationPolicy, "when_ambiguous");
  assert.equal(getCanderTool("gmail.search")?.capabilityFamily, "email");
  assert.ok(listCanderToolsForConnector("slack").length >= 3);
  assert.ok(listCanderToolsForFamily("messaging").some((t) => t.id === "slack.send"));
});

test("openai function schema conversion", () => {
  const tool = getCanderTool("gmail.send")!;
  const fn = canderToolToOpenAIFunction(tool);
  assert.equal(fn.type, "function");
  assert.equal(fn.name, "gmail_send");
  assert.match(fn.name, /^[a-zA-Z0-9_-]+$/);
  assert.ok(fn.parameters.properties.to);
});

test("openai tool name mapping round-trips connector ids", () => {
  assert.equal(toOpenAIToolName("gmail.search"), "gmail_search");
  assert.equal(fromOpenAIToolName("gmail_search"), "gmail.search");
  assert.equal(fromOpenAIToolName("slack_send"), "slack.send");
});

test("discovery selects email family from snapshot + message", () => {
  const snapshot: CapabilitySnapshot = {
    connectors: [
      {
        connectorId: "gmail",
        label: "Gmail",
        capabilityFamily: "email",
        accounts: [
          {
            connectionId: "c1",
            label: "Gmail",
            status: "active",
            capabilities: { search: true, read: true, send: true, draft: false, reply: false },
          },
        ],
      },
    ],
    families: {
      email: {
        connected: true,
        connectorIds: ["gmail"],
        accounts: [
          {
            connectionId: "c1",
            label: "Gmail",
            status: "active",
            capabilities: { search: true, read: true, send: true },
          },
        ],
      },
    },
  };
  const result = discoverRelevantTools({
    userMessage: "search my inbox for unread email",
    snapshot,
  });
  assert.ok(result.toolIds.includes("gmail.search"));
  assert.ok(result.families.includes("email"));
  assert.ok(!result.toolIds.includes("gmail.draft"));
});

test("discovery respects preferConnectorId scope", () => {
  const snapshot: CapabilitySnapshot = {
    connectors: [
      {
        connectorId: "gmail",
        label: "Gmail",
        capabilityFamily: "email",
        accounts: [
          {
            connectionId: "c1",
            label: "Gmail",
            status: "active",
            capabilities: { search: true, read: true, send: true, draft: false, reply: false },
          },
        ],
      },
      {
        connectorId: "slack",
        label: "Slack",
        capabilityFamily: "messaging",
        accounts: [
          {
            connectionId: "c2",
            label: "Slack",
            status: "active",
            capabilities: { search: true, read: true, send: true },
          },
        ],
      },
    ],
    families: {
      email: { connected: true, connectorIds: ["gmail"], accounts: [] },
      messaging: { connected: true, connectorIds: ["slack"], accounts: [] },
    },
  };
  const result = discoverRelevantTools({
    userMessage: "what did alex say?",
    snapshot,
    preferConnectorIds: ["gmail"],
  });
  assert.ok(result.toolIds.every((id) => id.startsWith("gmail.")));
  assert.match(result.reason, /scoped:gmail/);
});

test("discovery can scope multiple connectors", () => {
  const snapshot: CapabilitySnapshot = {
    connectors: [
      {
        connectorId: "gmail",
        label: "Gmail",
        capabilityFamily: "email",
        accounts: [
          {
            connectionId: "c1",
            label: "Gmail",
            status: "active",
            capabilities: { search: true, read: true, send: false, draft: false, reply: false },
          },
        ],
      },
      {
        connectorId: "slack",
        label: "Slack",
        capabilityFamily: "messaging",
        accounts: [
          {
            connectionId: "c2",
            label: "Slack",
            status: "active",
            capabilities: { search: true, read: true, send: false },
          },
        ],
      },
    ],
    families: {
      email: { connected: true, connectorIds: ["gmail"], accounts: [] },
      messaging: { connected: true, connectorIds: ["slack"], accounts: [] },
    },
  };
  const result = discoverRelevantTools({
    userMessage: "cross-check email and slack",
    snapshot,
    preferConnectorIds: ["gmail", "slack"],
  });
  assert.ok(result.toolIds.some((id) => id.startsWith("gmail.")));
  assert.ok(result.toolIds.some((id) => id.startsWith("slack.")));
});

test("discovery falls back to connected families when phrasing misses hints", () => {
  const snapshot: CapabilitySnapshot = {
    connectors: [
      {
        connectorId: "gmail",
        label: "Gmail",
        capabilityFamily: "email",
        accounts: [
          {
            connectionId: "c1",
            label: "Gmail",
            status: "active",
            capabilities: { search: true, read: true, send: false, draft: false, reply: false },
          },
        ],
      },
      {
        connectorId: "slack",
        label: "Slack",
        capabilityFamily: "messaging",
        accounts: [
          {
            connectionId: "c2",
            label: "Slack",
            status: "active",
            capabilities: { search: true, read: true, send: false },
          },
        ],
      },
    ],
    families: {
      email: {
        connected: true,
        connectorIds: ["gmail"],
        accounts: [],
      },
      messaging: {
        connected: true,
        connectorIds: ["slack"],
        accounts: [],
      },
    },
  };
  const result = discoverRelevantTools({
    userMessage: "what did alex say yesterday?",
    snapshot,
  });
  assert.ok(result.toolIds.includes("gmail.search"));
  assert.ok(result.toolIds.includes("slack.search") || result.toolIds.some((id) => id.startsWith("slack.")));
  assert.match(result.reason, /all_connected_families/);
});

test("reference resolution picks ordinal and suggests tools", () => {
  const refs = [
    { type: "email_message", id: "m1", label: "One" },
    { type: "email_message", id: "m2", label: "Two" },
  ];
  const second = resolveOrdinalReference(refs, "open the second one");
  assert.equal(second.ok, true);
  if (second.ok) assert.equal(second.reference.id, "m2");
  assert.ok(suggestToolsForReference(refs[0]!).includes("gmail.read"));
  assert.match(formatReferencesForPrompt(refs), /email_message/);
});

test("idempotency keys are stable for same args", () => {
  const a = buildIdempotencyKey({
    toolId: "gmail.send",
    connectionId: "c1",
    arguments: { to: "a@b.co", subject: "Hi", body: "Hello" },
    turnId: "t1",
  });
  const b = buildIdempotencyKey({
    toolId: "gmail.send",
    connectionId: "c1",
    arguments: { body: "Hello", subject: "Hi", to: "a@b.co" },
    turnId: "t1",
  });
  assert.equal(a, b);
  assert.equal(isWriteRisk("write"), true);
  assert.equal(isWriteRisk("read"), false);
});

test("capability snapshot prompt lists connected apps", () => {
  const text = formatCapabilitySnapshotForPrompt({
    connectors: [
      {
        connectorId: "gmail",
        label: "Gmail",
        capabilityFamily: "email",
        accounts: [
          {
            connectionId: "c1",
            label: "Work Gmail",
            status: "active",
            capabilities: { search: true, send: false },
          },
        ],
      },
    ],
    families: {},
  });
  assert.match(text, /Gmail/);
  assert.match(text, /send:off/);
});

test("slack tools authorize when permissions enabled", () => {
  const denied = authorizeConnectorToolAction({
    workspaceId: "ws",
    profileId: "p",
    connectorId: "slack",
    toolName: "slack.send",
    connectionId: "c1",
  });
  assert.equal(denied.ok, false);

  const allowed = authorizeConnectorToolAction({
    workspaceId: "ws",
    profileId: "p",
    connectorId: "slack",
    toolName: "slack.send",
    toolPermissions: { "slack.send": true },
    connectionId: "c1",
  });
  assert.equal(allowed.ok, true);
});

test("confirmation policy requires confirm when ambiguous send", () => {
  const tool = getCanderTool("gmail.send")!;
  const needed = evaluateConfirmationRequirement(tool, {
    workspaceId: "ws",
    profileId: "p",
    arguments: { to: "", subject: "", body: "" },
  });
  assert.equal(needed.required, true);

  const ok = evaluateConfirmationRequirement(tool, {
    workspaceId: "ws",
    profileId: "p",
    arguments: { to: "a@b.co", subject: "Hi", body: "Hello there" },
  });
  assert.equal(ok.required, false);
});
