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
