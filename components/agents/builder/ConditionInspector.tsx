"use client";

import { Plus } from "lucide-react";
import type { AgentRoute } from "@/lib/agents/types";
import { Field, InspectorSection, SelectField } from "./fields";
import { updateCondition } from "./workflow-model";

type Rule = { field: string; operator: string; value: string };

function rulesFromRoute(route: AgentRoute): Rule[] {
  const config = (route.condition.config ?? {}) as Record<string, unknown>;
  if (Array.isArray(config.rules) && config.rules.length) {
    return config.rules.map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      return {
        field: String(row.field ?? "sender"),
        operator: String(row.operator ?? "contains"),
        value: String(row.value ?? ""),
      };
    });
  }
  if (route.condition.expression && !route.condition.expression.includes("Choose")) {
    return [
      {
        field: String(config.field ?? "sender"),
        operator: String(config.operator ?? "contains"),
        value: String(config.value ?? route.condition.expression),
      },
    ];
  }
  return [{ field: "sender", operator: "contains", value: "" }];
}

function expressionFromRules(rules: Rule[]): string {
  const parts = rules
    .filter((r) => r.value.trim())
    .map((r) => `${labelField(r.field)} ${r.operator} “${r.value.trim()}”`);
  if (!parts.length) return "Choose a condition…";
  return parts.join(" and ");
}

function labelField(field: string) {
  if (field === "sender") return "Sender";
  if (field === "subject") return "Subject";
  if (field === "body") return "Body";
  return field;
}

export function ConditionInspector({
  route,
  busy,
  onSave,
}: {
  route: AgentRoute;
  busy: boolean;
  onSave: (route: AgentRoute) => void;
}) {
  const rules = rulesFromRoute(route);

  const saveRules = (next: Rule[]) => {
    onSave(
      updateCondition(route, {
        type: "rule",
        expression: expressionFromRules(next),
        config: {
          rules: next,
          incomplete: !next.some((r) => r.value.trim()),
        },
      }),
    );
  };

  return (
    <InspectorSection title="Only continue when this is true.">
      {rules.map((rule, index) => (
        <div
          key={index}
          className="space-y-2 rounded-[10px] border border-border p-2.5"
        >
          {index > 0 ? (
            <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
              And
            </p>
          ) : (
            <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
              If
            </p>
          )}
          <SelectField
            label="Field"
            value={rule.field}
            disabled={busy}
            options={[
              { value: "sender", label: "Email sender" },
              { value: "subject", label: "Subject" },
              { value: "body", label: "Body" },
              { value: "custom", label: "Custom value" },
            ]}
            onChange={(field) => {
              const next = [...rules];
              next[index] = { ...rule, field };
              saveRules(next);
            }}
          />
          <SelectField
            label="Operator"
            value={rule.operator}
            disabled={busy}
            options={[
              { value: "contains", label: "contains" },
              { value: "equals", label: "equals" },
              { value: "not_contains", label: "does not contain" },
              { value: "exists", label: "exists" },
            ]}
            onChange={(operator) => {
              const next = [...rules];
              next[index] = { ...rule, operator };
              saveRules(next);
            }}
          />
          <Field
            label="Value"
            defaultValue={rule.value}
            disabled={busy}
            placeholder="@acme.com"
            onCommit={(value) => {
              const next = [...rules];
              next[index] = { ...rule, value };
              saveRules(next);
            }}
          />
        </div>
      ))}
      <button
        type="button"
        disabled={busy}
        className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border px-2.5 text-[12.5px] font-medium hover:bg-muted disabled:opacity-50"
        onClick={() =>
          saveRules([
            ...rules,
            { field: "sender", operator: "contains", value: "" },
          ])
        }
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
        Add condition
      </button>
    </InspectorSection>
  );
}

export function BranchInspector({
  route,
  busy,
  onSave,
}: {
  route: AgentRoute;
  busy: boolean;
  onSave: (route: AgentRoute) => void;
}) {
  const config = (route.condition.config ?? {}) as Record<string, unknown>;
  const mode = String(config.mode ?? "condition");
  const prompt = String(config.prompt ?? "");

  return (
    <InspectorSection title="Split the path.">
      <SelectField
        label="Branch type"
        value={mode}
        disabled={busy}
        options={[
          { value: "condition", label: "Condition branch" },
          { value: "agent", label: "Agent decision" },
        ]}
        onChange={(next) =>
          onSave(
            updateCondition(route, {
              type: "branch",
              expression:
                next === "agent"
                  ? prompt || "Let the agent choose"
                  : route.condition.expression || "Yes / No",
              config: {
                ...config,
                mode: next,
                branches: [
                  { id: "yes", label: next === "agent" ? "Option A" : "Yes" },
                  { id: "no", label: next === "agent" ? "Option B" : "No" },
                ],
                incomplete: next === "agent" ? !prompt.trim() : false,
              },
            }),
          )
        }
      />
      {mode === "agent" ? (
        <Field
          label="Ask the agent"
          defaultValue={prompt}
          disabled={busy}
          placeholder="Is this a sales lead, support request, or spam?"
          onCommit={(nextPrompt) =>
            onSave(
              updateCondition(route, {
                type: "branch",
                expression: nextPrompt || "Let the agent choose",
                config: {
                  ...config,
                  mode: "agent",
                  prompt: nextPrompt,
                  incomplete: !nextPrompt.trim(),
                  branches: config.branches ?? [
                    { id: "a", label: "Option A" },
                    { id: "b", label: "Option B" },
                  ],
                },
              }),
            )
          }
        />
      ) : (
        <p className="text-[12.5px] text-muted-foreground">
          Configure the condition above the branch, or switch to an agent
          decision.
        </p>
      )}
    </InspectorSection>
  );
}
