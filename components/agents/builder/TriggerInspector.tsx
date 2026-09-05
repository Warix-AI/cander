"use client";

import type { AgentRoute, AgentRouteTrigger } from "@/lib/agents/types";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { toolsForConnector } from "@/lib/connectors/tool-catalog";
import { humanizeConnectorId, humanizeToolId } from "./humanize";
import { ChoiceChips, Field, InspectorSection, SelectField } from "./fields";
import { updateTrigger } from "./workflow-model";

const SOURCES = [
  { value: "cander", label: "Cander" },
  { value: "connector", label: "Connector" },
  { value: "schedule", label: "Schedule" },
  { value: "manual", label: "Manual" },
  { value: "webhook", label: "Webhook / API", disabled: true },
];

const CANDER_EVENTS = [
  { value: "project_message", label: "New project message" },
  { value: "manual_run", label: "Manual run" },
];

export function TriggerInspector({
  route,
  connections,
  busy,
  onSave,
}: {
  route: AgentRoute;
  connections: ConnectorConnection[];
  busy: boolean;
  onSave: (route: AgentRoute) => void;
}) {
  const config = (route.trigger.config ?? {}) as Record<string, unknown>;
  const source = String(config.source ?? route.trigger.type ?? "manual");

  const commit = (patch: Partial<AgentRouteTrigger>) => {
    onSave(updateTrigger(route, patch));
  };

  const setSource = (next: string) => {
    if (next === "connector") {
      commit({
        type: "connector",
        label: "Choose a connector event…",
        config: { source: "connector", incomplete: true },
      });
      return;
    }
    if (next === "schedule") {
      commit({
        type: "schedule",
        label: "On a schedule",
        config: { source: "schedule", cron: "0 9 * * 1-5" },
      });
      return;
    }
    if (next === "cander") {
      commit({
        type: "cander",
        label: "New project message",
        config: { source: "cander", event: "project_message" },
      });
      return;
    }
    commit({
      type: "manual",
      label: "Manual run",
      config: { source: "manual" },
    });
  };

  return (
    <InspectorSection title="When should this run?">
      <div>
        <p className="mb-1.5 font-mono text-[11px] text-muted-foreground">
          Trigger source
        </p>
        <ChoiceChips
          value={source === "webhook" ? "manual" : source}
          disabled={busy}
          onChange={setSource}
          options={SOURCES}
        />
      </div>

      {source === "cander" ? (
        <SelectField
          label="Event"
          value={String(config.event ?? "project_message")}
          disabled={busy}
          options={CANDER_EVENTS}
          onChange={(event) => {
            const opt = CANDER_EVENTS.find((o) => o.value === event);
            commit({
              type: "cander",
              label: opt?.label ?? "Cander event",
              config: { source: "cander", event },
            });
          }}
        />
      ) : null}

      {source === "connector" ? (
        <ConnectorTriggerFields
          route={route}
          connections={connections}
          busy={busy}
          onSave={onSave}
        />
      ) : null}

      {source === "schedule" ? (
        <Field
          label="Schedule"
          defaultValue={String(config.cron ?? "0 9 * * 1-5")}
          disabled={busy}
          placeholder="Weekdays at 9am"
          onCommit={(cron) =>
            commit({
              type: "schedule",
              label: `Schedule · ${cron}`,
              config: { source: "schedule", cron },
            })
          }
        />
      ) : null}

      {source === "manual" ? (
        <p className="text-[12.5px] text-muted-foreground">
          Runs when you start this agent manually.
        </p>
      ) : null}
    </InspectorSection>
  );
}

function ConnectorTriggerFields({
  route,
  connections,
  busy,
  onSave,
}: {
  route: AgentRoute;
  connections: ConnectorConnection[];
  busy: boolean;
  onSave: (route: AgentRoute) => void;
}) {
  const config = (route.trigger.config ?? {}) as Record<string, unknown>;
  const connectorId = String(config.connectorId ?? "");
  const connectionId = String(config.connectionId ?? "");
  const event = String(config.event ?? "");

  const commit = (patch: Partial<AgentRouteTrigger>) => {
    onSave(updateTrigger(route, patch));
  };

  const connectorOptions = [
    { value: "", label: "Choose connector" },
    ...Array.from(new Set(connections.map((c) => c.connectorId))).map((id) => ({
      value: id,
      label: humanizeConnectorId(id),
    })),
  ];

  const accountOptions = [
    { value: "", label: "Choose account" },
    ...connections
      .filter((c) => !connectorId || c.connectorId === connectorId)
      .map((c) => ({
        value: c.id,
        label: `${humanizeConnectorId(c.connectorId)} · ${c.id.slice(0, 8)}`,
      })),
  ];

  const eventTools = connectorId
    ? toolsForConnector(connectorId).filter((t) => t.access === "read")
    : [];
  const eventOptions = [
    { value: "", label: "Choose event" },
    ...eventTools.map((t) => ({ value: t.id, label: t.label })),
    ...(connectorId === "gmail"
      ? [{ value: "gmail_new_email", label: "New email received" }]
      : []),
  ];

  return (
    <>
      <SelectField
        label="Connector"
        value={connectorId}
        disabled={busy}
        options={connectorOptions}
        onChange={(id) =>
          commit({
            type: "connector",
            label: "Choose an event…",
            config: {
              source: "connector",
              connectorId: id,
              connectorLabel: humanizeConnectorId(id),
              incomplete: true,
            },
          })
        }
      />
      {connectorId ? (
        <SelectField
          label="Event"
          value={event}
          disabled={busy}
          options={eventOptions}
          onChange={(nextEvent) => {
            const label =
              eventOptions.find((o) => o.value === nextEvent)?.label ??
              humanizeToolId(nextEvent);
            commit({
              type: "connector",
              label,
              config: {
                source: "connector",
                connectorId,
                connectorLabel: humanizeConnectorId(connectorId),
                connectionId,
                event: nextEvent,
                incomplete: !nextEvent,
              },
            });
          }}
        />
      ) : null}
      {connectorId ? (
        <SelectField
          label="Account"
          value={connectionId}
          disabled={busy}
          options={accountOptions}
          onChange={(nextConn) => {
            const conn = connections.find((c) => c.id === nextConn);
            const label =
              route.trigger.label && !route.trigger.label.includes("Choose")
                ? route.trigger.label
                : "Connector event";
            commit({
              type: "connector",
              label,
              config: {
                ...config,
                source: "connector",
                connectionId: nextConn,
                accountLabel: conn
                  ? `${humanizeConnectorId(conn.connectorId)} account`
                  : undefined,
                incomplete: !event,
              },
            });
          }}
        />
      ) : null}
      {event ? (
        <Field
          label="Optional filter"
          defaultValue={String(config.filterSummary ?? "")}
          disabled={busy}
          placeholder="e.g. Inbox, sender contains…"
          onCommit={(filterSummary) =>
            commit({
              label: route.trigger.label,
              config: {
                ...config,
                filterSummary: filterSummary || undefined,
                incomplete: false,
              },
            })
          }
        />
      ) : null}
    </>
  );
}
