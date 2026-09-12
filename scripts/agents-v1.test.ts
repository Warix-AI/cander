/**
 * Agents delegator model — schedule, activity outcomes, connector scope.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScheduleTrigger,
  coerceSchedulePreset,
  computeNextRunAt,
  cronFromPreset,
  scheduleIdempotencyKey,
} from "../lib/agents/schedule.ts";
import {
  activityOutcomeFromRunStatus,
  errorMessageFromUnknown,
  fallbackRunOutcomeSummary,
  parseAgentTrigger,
  runToActivityItem,
  type AgentRun,
} from "../lib/agents/types.ts";
import { resolveConnectorScope } from "../lib/ai/tools/connector-scope.ts";
import {
  bundleToAgentDefinition,
  formatAgentDefinitionSummary,
} from "../lib/agents/definition.ts";

describe("schedule presets", () => {
  it("supports minute-level presets", () => {
    assert.equal(cronFromPreset("every_1_minute"), "* * * * *");
    assert.equal(cronFromPreset("every_5_minutes"), "*/5 * * * *");
    assert.equal(cronFromPreset("every_15_minutes"), "*/15 * * * *");
    assert.equal(cronFromPreset("every_30_minutes"), "*/30 * * * *");
    assert.equal(cronFromPreset("hourly", "09:15"), "15 * * * *");
    const trigger = buildScheduleTrigger({
      preset: "every_15_minutes",
      timezone: "America/Denver",
    });
    assert.equal(trigger.type, "schedule");
    assert.equal(trigger.preset, "every_15_minutes");
    const next = computeNextRunAt(trigger, new Date("2026-09-11T15:00:00Z"));
    assert.ok(next instanceof Date);
  });

  it("coerces legacy presets", () => {
    assert.equal(coerceSchedulePreset("weekday"), "daily");
    assert.equal(coerceSchedulePreset("every_few_hours"), "hourly");
    assert.equal(coerceSchedulePreset("every_5_minutes"), "every_5_minutes");
  });

  it("builds stable schedule idempotency keys", () => {
    const a = scheduleIdempotencyKey(
      "pag_abc",
      "2026-09-11T15:00:00.000Z",
    );
    const b = scheduleIdempotencyKey(
      "pag_abc",
      "2026-09-11T15:00:00.000Z",
    );
    assert.equal(a, b);
    assert.match(a, /^schedule:pag_abc:/);
  });
});

describe("trigger parse", () => {
  it("maps legacy gmail trigger to manual", () => {
    const t = parseAgentTrigger({
      type: "gmail_new_message",
      connectionId: "conn_1",
      filter: { fromContains: "boss@" },
    });
    assert.equal(t.type, "manual");
  });

  it("parses schedule triggers", () => {
    const t = parseAgentTrigger({
      type: "schedule",
      cron: "*/5 * * * *",
      timezone: "UTC",
      preset: "every_5_minutes",
    });
    assert.equal(t.type, "schedule");
    if (t.type === "schedule") {
      assert.equal(t.preset, "every_5_minutes");
    }
  });
});

describe("errorMessageFromUnknown", () => {
  it("reads plain object message fields", () => {
    assert.equal(
      errorMessageFromUnknown({ message: "openai timeout" }),
      "openai timeout",
    );
  });
});

describe("activity outcomes", () => {
  it("maps run statuses including waiting / approval_needed", () => {
    assert.equal(activityOutcomeFromRunStatus("completed"), "completed");
    assert.equal(activityOutcomeFromRunStatus("failed"), "failed");
    assert.equal(activityOutcomeFromRunStatus("waiting"), "waiting");
    assert.equal(activityOutcomeFromRunStatus("approval_needed"), "waiting");
    assert.equal(activityOutcomeFromRunStatus("cancelled"), "cancelled");
    assert.equal(activityOutcomeFromRunStatus("running"), "running");
  });

  it("builds activity items from runs", () => {
    const run: AgentRun = {
      id: "arun_1",
      workspaceId: "ws_1",
      projectId: "proj_1",
      agentId: "pag_1",
      triggerType: "schedule",
      status: "waiting",
      startedAt: "2026-09-11T18:00:00.000Z",
      completedAt: "2026-09-11T18:01:00.000Z",
      summary: "Waiting for approval to send email.",
      error: null,
      idempotencyKey: null,
      triggerPayload: {},
    };
    const item = runToActivityItem({ run, agentName: "First" });
    assert.equal(item.status, "waiting");
    assert.equal(item.agentName, "First");
    assert.match(item.summary, /approval/i);
  });

  it("falls back to concise outcome copy", () => {
    assert.match(
      fallbackRunOutcomeSummary({ status: "failed", error: "boom" }),
      /boom/,
    );
    assert.match(
      fallbackRunOutcomeSummary({ status: "waiting" }),
      /Waiting/,
    );
    assert.equal(
      fallbackRunOutcomeSummary({
        status: "completed",
        lastCander: "Booked the appointment.",
      }),
      "Booked the appointment.",
    );
  });
});

describe("agent scope via connector scope", () => {
  it("fails closed when scoped connection ids do not resolve", () => {
    const scope = resolveConnectorScope({
      selectedConnectionIds: ["conn_missing"],
      activeConnections: [
        { connectionId: "conn_a_gmail", connectorId: "gmail" },
      ],
    });
    assert.equal(scope.scopeRequested, true);
    assert.equal(scope.failClosed, true);
    assert.equal(scope.scopedConnections.length, 0);
  });

  it("intersects to allowed connections only", () => {
    const scope = resolveConnectorScope({
      selectedConnectionIds: ["conn_a_gmail", "conn_other"],
      activeConnections: [
        { connectionId: "conn_a_gmail", connectorId: "gmail" },
        { connectionId: "conn_a_slack", connectorId: "slack" },
      ],
    });
    assert.equal(scope.failClosed, false);
    assert.deepEqual(
      scope.scopedConnections.map((c) => c.connectionId),
      ["conn_a_gmail"],
    );
  });

  it("empty scope means unrestricted (no request)", () => {
    const scope = resolveConnectorScope({
      selectedConnectionIds: [],
      activeConnections: [
        { connectionId: "conn_a_gmail", connectorId: "gmail" },
      ],
    });
    assert.equal(scope.scopeRequested, false);
    assert.equal(scope.failClosed, false);
  });
});

describe("agent definition includes scope", () => {
  it("formats empty and non-empty scope", () => {
    const empty = bundleToAgentDefinition({
      agent: {
        id: "pag_1",
        workspaceId: "ws",
        projectId: "p",
        name: "Booking",
        description: "",
        instructions: "Handle bookings.",
        enabled: true,
        status: "active",
        trigger: { type: "manual" },
        nextRunAt: null,
        lastTriggeredAt: null,
        icon: null,
        color: null,
        pinned: false,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
      },
      scope: [],
      runs: [],
      messages: [],
    });
    assert.match(formatAgentDefinitionSummary(empty), /all user connectors/);
    assert.match(formatAgentDefinitionSummary(empty), /Expert: Booking/);
    assert.match(
      formatAgentDefinitionSummary(empty),
      /Description \(routing for Cander\)|Description: \(empty/,
    );

    const scoped = {
      ...empty,
      scope: [
        {
          connectionId: "conn_1",
          connectorId: "gmail",
          label: "booking@company.com",
        },
      ],
    };
    assert.match(
      formatAgentDefinitionSummary(scoped),
      /booking@company\.com/,
    );
  });
});

describe("expert directory privacy and search", () => {
  it("searchExpertDirectory ranks by description keywords and never needs instructions", async () => {
    const {
      searchExpertDirectory,
      formatExpertDirectoryForPrompt,
    } = await import("../lib/agents/directory-search.ts");

    const entries = [
      {
        id: "e1",
        projectId: "p1",
        workspaceId: "ws",
        name: "Booking",
        description:
          "Handles appointment requests, cancellations, rescheduling, and scheduling questions.",
        status: "active",
      },
      {
        id: "e2",
        projectId: "p2",
        workspaceId: "ws",
        name: "Billing",
        description:
          "Handles invoices, payments, failed charges, refunds, and billing questions.",
        status: "active",
      },
      {
        id: "e3",
        projectId: "p3",
        workspaceId: "ws",
        name: "Support",
        description:
          "Handles product questions, customer issues, complaints, and troubleshooting.",
        status: "active",
      },
    ];

    const billed = searchExpertDirectory(
      entries,
      "Customer refund for a failed payment charge",
      3,
    );
    assert.equal(billed[0]?.name, "Billing");

    const booked = searchExpertDirectory(
      entries,
      "Need to reschedule an appointment cancellation",
      3,
    );
    assert.equal(booked[0]?.name, "Booking");

    const prompt = formatExpertDirectoryForPrompt(entries);
    assert.match(prompt, /Booking/);
    assert.match(prompt, /Billing/);
    assert.doesNotMatch(prompt, /instructions/i);
    assert.doesNotMatch(JSON.stringify(entries), /"instructions"/);
  });

  it("assertNoInstructionsLeak rejects payloads with instructions", async () => {
    const { assertNoInstructionsLeak } = await import(
      "../lib/agents/directory-search.ts"
    );
    assert.equal(
      assertNoInstructionsLeak({
        experts: [{ id: "1", name: "Booking", description: "x", status: "active" }],
      }),
      true,
    );
    assert.equal(
      assertNoInstructionsLeak({
        experts: [{ id: "1", instructions: "secret rules" }],
      }),
      false,
    );
  });

  it("isExpertRoutingIntent unlocks experts domain", async () => {
    const { isExpertRoutingIntent, resolveAllowedToolsForTurn } = await import(
      "../lib/ai/tools/domains.ts"
    );
    assert.equal(isExpertRoutingIntent("Which expert should handle this?"), true);
    assert.equal(isExpertRoutingIntent("hello there"), false);
    const turn = resolveAllowedToolsForTurn({
      content: "A customer needs help with a refund",
    });
    assert.ok(turn.domains.includes("experts"));
    assert.ok(turn.toolNames.includes("experts.list"));
    assert.ok(turn.toolNames.includes("experts.search"));
    assert.ok(!turn.toolNames.some((n) => n.includes("instructions")));
  });
});

describe("connector mail → expert situation", () => {
  it("formats Cander opening with Expert name and full email context", async () => {
    const {
      formatMailSituation,
      gmailEventIdempotencyKey,
    } = await import("../lib/agents/connector-event-format.ts");

    const situation = formatMailSituation({
      expertName: "Rescheduling Expert",
      message: {
        providerMessageId: "msg_1",
        fromAddr: "Sarah Jones <sarah@example.com>",
        toAddrs: ["bookings@example.com"],
        subject: "Move appointment",
        snippet: "preview only",
        bodyText:
          "Hi, I can't make my appointment tomorrow. Can we move it to Friday?",
        receivedAt: "2026-09-11T18:00:00.000Z",
        threadId: "thread_1",
      },
    });
    assert.match(situation, /Hey Rescheduling Expert/);
    assert.match(situation, /Sarah Jones/);
    assert.match(situation, /Subject: Move appointment/);
    assert.match(situation, /move it to Friday/);
    assert.match(situation, /Ground your advice/);
    assert.match(situation, /How should we handle this/);
    assert.doesNotMatch(situation, /instructions/i);
    assert.doesNotMatch(situation, /preview only/);

    assert.equal(
      gmailEventIdempotencyKey("conn_1", "msg_1"),
      "event:gmail:conn_1:msg_1",
    );
  });

  it("includes prior thread messages when provided", async () => {
    const { formatMailSituation } = await import(
      "../lib/agents/connector-event-format.ts"
    );
    const situation = formatMailSituation({
      expertName: "Rescheduling Expert",
      message: {
        providerMessageId: "msg_2",
        fromAddr: "matt@warix.co",
        subject: "Reschedule Appointment",
        bodyText: "I need to reschedule my appointment for thrsday next week",
        receivedAt: "2026-09-12T04:30:00.000Z",
        threadId: "thr_abc",
      },
      threadMessages: [
        {
          providerMessageId: "msg_1",
          fromAddr: "office@example.com",
          bodyText: "Your appointment is set for Monday at 2pm.",
          receivedAt: "2026-09-10T15:00:00.000Z",
          threadId: "thr_abc",
        },
        {
          providerMessageId: "msg_2",
          fromAddr: "matt@warix.co",
          bodyText: "I need to reschedule my appointment for thrsday next week",
          receivedAt: "2026-09-12T04:30:00.000Z",
          threadId: "thr_abc",
        },
      ],
    });
    assert.match(situation, /Full email thread/);
    assert.match(situation, /Monday at 2pm/);
    assert.match(situation, /thrsday next week/);
    assert.match(situation, /← latest/);
    assert.doesNotMatch(situation, /This is part of an existing email thread/);
  });

  it("falls back to snippet when body is missing", async () => {
    const { formatMailSituation } = await import(
      "../lib/agents/connector-event-format.ts"
    );
    const situation = formatMailSituation({
      message: {
        providerMessageId: "msg_2",
        fromAddr: "matt@warix.co",
        subject: "Reschedule",
        snippet: "Could we do Friday instead?",
      },
    });
    assert.match(situation, /Could we do Friday instead/);
  });

  it("ranks Rescheduling Expert for appointment-move mail", async () => {
    const { scoreExpertDirectory, searchExpertDirectory } = await import(
      "../lib/agents/directory-search.ts"
    );
    const ranked = searchExpertDirectory(
      [
        {
          id: "e1",
          projectId: "p1",
          name: "First",
          description: "General helper for routine tasks.",
          status: "active",
        },
        {
          id: "e2",
          projectId: "p1",
          name: "Rescheduling",
          description:
            "Handles incoming customer requests to move or change scheduled appointments and determines how Cander should respond.",
          status: "active",
        },
      ],
      "Hi, I can't make my appointment tomorrow. Can we move it to Friday?",
      3,
    );
    assert.equal(ranked[0]?.name, "Rescheduling");

    const scored = scoreExpertDirectory(
      [
        {
          id: "e1",
          projectId: "p1",
          name: "First",
          description: "Gmail assistant that drafts replies for your approval.",
          status: "active",
        },
        {
          id: "e2",
          projectId: "p1",
          name: "Rescheduling Expert",
          description:
            "Handles incoming Gmail messages about rescheduling appointments and tells Cander how to respond to the customer.",
          status: "active",
        },
      ],
      "Subject: Reschedule Appointment\nI'd like to reschedule my appointment tomorrow",
    );
    assert.equal(scored[0]?.entry.name, "Rescheduling Expert");
    assert.ok(
      scored[0]!.score >= (scored[1]?.score ?? 0) + 2,
      "Rescheduling should clearly outrank generic Gmail assistant",
    );
  });
});

describe("expert runtime thread scoping", () => {
  it("keys runtime chat ids by expert agent id", async () => {
    const { agentRuntimeChatId } = await import("../lib/persistent-chat.ts");
    const a = agentRuntimeChatId("ws", "proj", "expert-a");
    const b = agentRuntimeChatId("ws", "proj", "expert-b");
    const legacy = agentRuntimeChatId("ws", "proj");
    assert.notEqual(a, b);
    assert.notEqual(a, legacy);
    assert.match(a, /expert-a$/);
    assert.match(b, /expert-b$/);
  });
});

describe("expert visible message sanitization", () => {
  it("strips meta-language about instructions and runtime", async () => {
    const { sanitizeExpertVisibleMessage } = await import(
      "../lib/agents/expert-voice.ts"
    );
    const cleaned = sanitizeExpertVisibleMessage(
      "Apply my Instructions to this email. Let's ask Matthew for two preferred times. Do not rescan the whole inbox.",
    );
    assert.match(cleaned, /ask Matthew/i);
    assert.doesNotMatch(cleaned, /instructions/i);
    assert.doesNotMatch(cleaned, /rescan/i);
  });
});
