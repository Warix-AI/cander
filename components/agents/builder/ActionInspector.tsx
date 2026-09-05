"use client";

import type { AgentRoute, AgentRouteAction } from "@/lib/agents/types";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { toolsForConnector } from "@/lib/connectors/tool-catalog";
import { humanizeConnectorId, humanizeToolId } from "./humanize";
import {
  ChoiceChips,
  Field,
  InspectorSection,
  SelectField,
  TextArea,
} from "./fields";
import { parseStepId, updateAction } from "./workflow-model";

const CATEGORIES = [
  { value: "cander", label: "Cander" },
  { value: "connector", label: "Connector" },
  { value: "agent", label: "Agent" },
  { value: "project", label: "Project" },
];

const AGENT_ACTIONS = [
  { value: "agent_decide", label: "Ask agent to decide" },
  { value: "agent_generate", label: "Generate a response" },
  { value: "agent_summarize", label: "Summarize content" },
  { value: "agent_classify", label: "Classify something" },
  { value: "agent_extract", label: "Extract information" },
];

const CANDER_ACTIONS = [
  { value: "notify", label: "Notify in project chat" },
  { value: "update_project", label: "Update project notes" },
];

const PROJECT_ACTIONS = [
  { value: "pin_item", label: "Pin an item" },
  { value: "create_task", label: "Create a work item" },
];

export function ActionInspector({
  route,
  stepId,
  connections,
  busy,
  onSave,
}: {
  route: AgentRoute;
  stepId: string;
  connections: ConnectorConnection[];
  busy: boolean;
  onSave: (route: AgentRoute) => void;
}) {
  const parsed = parseStepId(stepId);
  const index = parsed?.actionIndex ?? 0;
  const action = route.actions[index];
  if (!action) {
    return (
      <p className="text-[12.5px] text-muted-foreground">Action not found.</p>
    );
  }

  const config = (action.config ?? {}) as Record<string, unknown>;
  const category = String(
    config.category ??
      (action.type?.startsWith("agent_")
        ? "agent"
        : action.type === "notify" || action.type === "update_project"
          ? "cander"
          : config.connectorId
            ? "connector"
            : "connector"),
  );

  const commit = (patch: Partial<AgentRouteAction>) => {
    onSave(updateAction(route, index, patch));
  };

  return (
    <InspectorSection title="What should happen?">
      <div>
        <p className="mb-1.5 font-mono text-[11px] text-muted-foreground">
          Category
        </p>
        <ChoiceChips
          value={category}
          disabled={busy}
          options={CATEGORIES}
          onChange={(next) =>
            commit({
              type: next === "agent" ? "agent_decide" : "action",
              label: "Choose an action…",
              config: { category: next, incomplete: true },
            })
          }
        />
      </div>

      {category === "cander" ? (
        <SelectField
          label="Action"
          value={String(action.type ?? "")}
          disabled={busy}
          options={[
            { value: "", label: "Choose action" },
            ...CANDER_ACTIONS,
          ]}
          onChange={(type) => {
            const label =
              CANDER_ACTIONS.find((a) => a.value === type)?.label ?? type;
            commit({
              type,
              label,
              config: { category: "cander" },
            });
          }}
        />
      ) : null}

      {category === "project" ? (
        <SelectField
          label="Action"
          value={String(action.type ?? "")}
          disabled={busy}
          options={[
            { value: "", label: "Choose action" },
            ...PROJECT_ACTIONS,
          ]}
          onChange={(type) => {
            const label =
              PROJECT_ACTIONS.find((a) => a.value === type)?.label ?? type;
            commit({
              type,
              label,
              config: { category: "project" },
            });
          }}
        />
      ) : null}

      {category === "agent" ? (
        <>
          <SelectField
            label="Agent action"
            value={String(action.type ?? "agent_decide")}
            disabled={busy}
            options={AGENT_ACTIONS}
            onChange={(type) => {
              const label =
                AGENT_ACTIONS.find((a) => a.value === type)?.label ?? type;
              commit({
                type,
                label,
                config: {
                  category: "agent",
                  prompt: String(config.prompt ?? ""),
                },
              });
            }}
          />
          <TextArea
            label="Prompt"
            defaultValue={String(config.prompt ?? "")}
            disabled={busy}
            rows={4}
            placeholder="Decide whether this email requires a response"
            onCommit={(prompt) =>
              commit({
                type: action.type || "agent_decide",
                label: prompt.trim()
                  ? prompt.trim().slice(0, 80)
                  : AGENT_ACTIONS.find((a) => a.value === action.type)
                      ?.label || "Ask agent",
                config: { category: "agent", prompt },
              })
            }
          />
        </>
      ) : null}

      {category === "connector" ? (
        <ConnectorActionFields
          action={action}
          connections={connections}
          busy={busy}
          onCommit={commit}
        />
      ) : null}
    </InspectorSection>
  );
}

function ConnectorActionFields({
  action,
  connections,
  busy,
  onCommit,
}: {
  action: AgentRouteAction;
  connections: ConnectorConnection[];
  busy: boolean;
  onCommit: (patch: Partial<AgentRouteAction>) => void;
}) {
  const config = (action.config ?? {}) as Record<string, unknown>;
  const connectorId = String(config.connectorId ?? "");
  const toolId = String(config.toolId ?? action.type ?? "");
  const tools = connectorId ? toolsForConnector(connectorId) : [];
  const writeTools = tools.filter((t) => t.access === "write" || t.access === "read");

  return (
    <>
      <SelectField
        label="Connector"
        value={connectorId}
        disabled={busy}
        options={[
          { value: "", label: "Choose connector" },
          ...Array.from(new Set(connections.map((c) => c.connectorId))).map(
            (id) => ({
              value: id,
              label: humanizeConnectorId(id),
            }),
          ),
        ]}
        onChange={(id) =>
          onCommit({
            type: "action",
            label: "Choose an action…",
            config: {
              category: "connector",
              connectorId: id,
              connectorLabel: humanizeConnectorId(id),
              incomplete: true,
            },
          })
        }
      />
      {connectorId ? (
        <SelectField
          label="Action"
          value={toolId}
          disabled={busy}
          options={[
            { value: "", label: "Choose action" },
            ...writeTools.map((t) => ({ value: t.id, label: t.label })),
          ]}
          onChange={(nextTool) => {
            const label = humanizeToolId(nextTool);
            onCommit({
              type: nextTool || "action",
              label,
              config: {
                category: "connector",
                connectorId,
                connectorLabel: humanizeConnectorId(connectorId),
                toolId: nextTool,
                incomplete: !nextTool,
              },
            });
          }}
        />
      ) : null}
      {toolId ? (
        <>
          <Field
            label="To / target"
            defaultValue={String(config.to ?? "")}
            disabled={busy}
            placeholder="{{trigger.sender}}"
            onCommit={(to) =>
              onCommit({
                label: action.label,
                config: { ...config, to, incomplete: false },
              })
            }
          />
          <Field
            label="Subject"
            defaultValue={String(config.subject ?? "")}
            disabled={busy}
            onCommit={(subject) =>
              onCommit({
                label: action.label,
                config: { ...config, subject, incomplete: false },
              })
            }
          />
          <TextArea
            label="Body"
            defaultValue={String(config.body ?? "")}
            disabled={busy}
            rows={4}
            placeholder="Thanks for reaching out…"
            onCommit={(body) =>
              onCommit({
                label: action.label,
                config: { ...config, body, incomplete: false },
              })
            }
          />
          <p className="text-[11.5px] text-muted-foreground">
            Use {"{{trigger.*}}"} variables for dynamic values.
          </p>
        </>
      ) : null}
    </>
  );
}

export function WaitInspector({
  route,
  stepId,
  busy,
  onSave,
}: {
  route: AgentRoute;
  stepId: string;
  busy: boolean;
  onSave: (route: AgentRoute) => void;
}) {
  const parsed = parseStepId(stepId);
  const index = parsed?.actionIndex ?? 0;
  const action = route.actions[index];
  if (!action) {
    return (
      <p className="text-[12.5px] text-muted-foreground">Wait step not found.</p>
    );
  }
  const config = (action.config ?? {}) as Record<string, unknown>;
  const hours = Number(config.durationHours ?? 24);

  return (
    <InspectorSection title="How long should the agent wait?">
      <SelectField
        label="Duration"
        value={String(hours)}
        disabled={busy}
        options={[
          { value: "1", label: "1 hour" },
          { value: "24", label: "24 hours" },
          { value: "48", label: "2 days" },
          { value: "168", label: "1 week" },
        ]}
        onChange={(value) => {
          const durationHours = Number(value);
          const label =
            durationHours === 1
              ? "Wait 1 hour"
              : durationHours === 24
                ? "Wait 24 hours"
                : durationHours === 48
                  ? "Wait 2 days"
                  : `Wait ${durationHours} hours`;
          onSave(
            updateAction(route, index, {
              type: "wait",
              label,
              config: { durationHours, incomplete: false },
            }),
          );
        }}
      />
    </InspectorSection>
  );
}
