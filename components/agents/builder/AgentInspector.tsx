"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
  Sparkles,
} from "lucide-react";
import type { AgentConfigPatch, ProjectAgentBundle } from "@/lib/agents/types";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { toolsForConnector } from "@/lib/connectors/tool-catalog";
import { humanizeConnectorId } from "./humanize";
import { Field, ListRow } from "./fields";

export function AgentInspector({
  tab,
  onTabChange,
  agent,
  skills,
  knowledge,
  knowledgeBases,
  connections,
  connectorEnabled,
  toolMap,
  busy,
  hideTabs,
  onSaveIdentity,
  onPatch,
}: {
  tab: "agent" | "access" | "skills" | "knowledge";
  onTabChange: (tab: "agent" | "access" | "skills" | "knowledge") => void;
  agent: ProjectAgentBundle["agent"];
  skills: ProjectAgentBundle["skills"];
  knowledge: ProjectAgentBundle["knowledge"];
  knowledgeBases: Array<{ id: string; name: string }>;
  connections: ConnectorConnection[];
  connectorEnabled: Map<string, boolean>;
  toolMap: Map<string, boolean>;
  busy: boolean;
  /** When true, parent owns navigation (config-first builder). */
  hideTabs?: boolean;
  onSaveIdentity: (
    patch: Partial<{
      name: string;
      description: string;
      instructions: string;
      enabled: boolean;
    }>,
  ) => void;
  onPatch: (patch: AgentConfigPatch) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {hideTabs ? null : (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-2 [scrollbar-width:none]">
          {(
            [
              ["agent", "Agent"],
              ["access", "Access"],
              ["skills", "Skills"],
              ["knowledge", "Knowledge"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={
                tab === id
                  ? "shrink-0 rounded-full bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background"
                  : "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {tab === "agent" ? (
          <div className="space-y-3">
            <Field
              label="Name"
              defaultValue={agent.name}
              disabled={busy}
              onCommit={(value) => onSaveIdentity({ name: value })}
            />
            <Field
              label="Description"
              defaultValue={agent.description}
              disabled={busy}
              onCommit={(value) => onSaveIdentity({ description: value })}
            />
            <p className="text-[12.5px] text-muted-foreground">
              Behavior lives in Skills. Use the Skills tab to write what this
              agent should accomplish.
            </p>
          </div>
        ) : null}
        {tab === "access" ? (
          <AccessEditor
            connections={connections}
            connectorEnabled={connectorEnabled}
            toolMap={toolMap}
            busy={busy}
            onPatch={onPatch}
          />
        ) : null}
        {tab === "skills" ? (
          <SkillsEditor
            skills={skills}
            busy={busy}
            onAdd={(label) =>
              onPatch({
                addSkills: [
                  {
                    skillId: `skill_${label
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "_")}`,
                    skillLabel: label,
                  },
                ],
              })
            }
            onRemove={(skillId) => onPatch({ removeSkillIds: [skillId] })}
          />
        ) : null}
        {tab === "knowledge" ? (
          <KnowledgeEditor
            knowledge={knowledge}
            knowledgeBases={knowledgeBases}
            busy={busy}
            onAdd={(kb) =>
              onPatch({
                addKnowledge: [
                  {
                    sourceKind: "knowledge_base",
                    sourceId: kb.id,
                    sourceLabel: kb.name,
                  },
                ],
              })
            }
            onRemove={(id) => onPatch({ removeKnowledgeIds: [id] })}
          />
        ) : null}
      </div>
    </div>
  );
}

function AccessEditor({
  connections,
  connectorEnabled,
  toolMap,
  busy,
  onPatch,
}: {
  connections: ConnectorConnection[];
  connectorEnabled: Map<string, boolean>;
  toolMap: Map<string, boolean>;
  busy: boolean;
  onPatch: (patch: AgentConfigPatch) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!connections.length) {
    return (
      <p className="text-[12.5px] text-muted-foreground">
        Connect apps in Connectors, then grant tools here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-muted-foreground">
        Project access is limited to what you enable below. The agent only sees
        connectors and tools you grant.
      </p>
      {connections.map((conn) => {
        const enabled = connectorEnabled.get(conn.id) ?? false;
        const open = expanded === conn.id;
        const tools = toolsForConnector(conn.connectorId);
        const sensitive = tools.some(
          (t) =>
            (toolMap.get(`${conn.id}:${t.id}`) ?? false) &&
            (t.risk === "write" ||
              t.risk === "destructive" ||
              t.confirmationPolicy === "always"),
        );
        return (
          <div key={conn.id} className="rounded-[10px] border border-border">
            <div className="flex items-center gap-2 px-2.5 py-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => setExpanded(open ? null : conn.id)}
              >
                {open ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">
                    {humanizeConnectorId(conn.connectorId)}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {enabled ? "Enabled for this agent" : "Not granted"}
                  </span>
                </span>
              </button>
              <input
                type="checkbox"
                checked={enabled}
                disabled={busy}
                onChange={(event) =>
                  onPatch({
                    setConnectorEnabled: [
                      {
                        connectionId: conn.id,
                        connectorId: conn.connectorId,
                        enabled: event.target.checked,
                      },
                    ],
                  })
                }
              />
            </div>
            {open ? (
              <div className="space-y-2 border-t border-border px-2.5 py-2">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["Select all", true, null],
                      ["Read only", true, "read"],
                      ["Disable all", false, null],
                    ] as const
                  ).map(([label, connectorOn, access]) => (
                    <button
                      key={label}
                      type="button"
                      disabled={busy}
                      className="h-7 rounded-[8px] border border-border px-2 text-[11.5px] font-medium hover:bg-muted disabled:opacity-50"
                      onClick={() =>
                        onPatch({
                          setConnectorEnabled: [
                            {
                              connectionId: conn.id,
                              connectorId: conn.connectorId,
                              enabled: connectorOn,
                            },
                          ],
                          setToolPermissions: tools.map((tool) => ({
                            connectionId: conn.id,
                            toolId: tool.id,
                            enabled:
                              access === "read"
                                ? tool.access === "read"
                                : connectorOn,
                          })),
                        })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {sensitive ? (
                  <p className="rounded-[8px] bg-muted/60 px-2 py-1.5 text-[11.5px] text-muted-foreground">
                    Some enabled tools can send, delete, or publish. Review
                    carefully.
                  </p>
                ) : null}
                {tools.map((tool) => {
                  const on = toolMap.get(`${conn.id}:${tool.id}`) ?? false;
                  return (
                    <label
                      key={tool.id}
                      className="flex items-center justify-between gap-3 text-[12.5px]"
                    >
                      <span className="min-w-0 truncate">{tool.label}</span>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={busy}
                        onChange={(event) =>
                          onPatch({
                            setToolPermissions: [
                              {
                                connectionId: conn.id,
                                toolId: tool.id,
                                enabled: event.target.checked,
                              },
                            ],
                          })
                        }
                      />
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SkillsEditor({
  skills,
  busy,
  onAdd,
  onRemove,
}: {
  skills: ProjectAgentBundle["skills"];
  busy: boolean;
  onAdd: (label: string) => void;
  onRemove: (skillId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[12.5px] text-muted-foreground">
        Skills are reusable behavior packages for this agent.
      </p>
      {skills.map((skill) => (
        <ListRow
          key={skill.id}
          title={skill.skillLabel || skill.skillId}
          onRemove={() => onRemove(skill.skillId)}
        />
      ))}
      {!skills.length ? (
        <p className="text-[12.5px] text-muted-foreground">No skills yet.</p>
      ) : null}
      <div className="flex flex-wrap gap-1.5 pt-1">
        <button
          type="button"
          disabled={busy}
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border px-2.5 text-[12.5px] font-medium hover:bg-muted disabled:opacity-50"
          onClick={() => {
            const label = window.prompt("Skill name");
            if (!label?.trim()) return;
            onAdd(label.trim());
          }}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
          Add skill
        </button>
        <button
          type="button"
          disabled={busy}
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border px-2.5 text-[12.5px] font-medium hover:bg-muted disabled:opacity-50"
          onClick={() => {
            const label = window.prompt(
              "Describe the skill you want to generate",
            );
            if (!label?.trim()) return;
            onAdd(label.trim());
          }}
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.6} />
          Generate skill
        </button>
      </div>
    </div>
  );
}

function KnowledgeEditor({
  knowledge,
  knowledgeBases,
  busy,
  onAdd,
  onRemove,
}: {
  knowledge: ProjectAgentBundle["knowledge"];
  knowledgeBases: Array<{ id: string; name: string }>;
  busy: boolean;
  onAdd: (kb: { id: string; name: string }) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[12.5px] text-muted-foreground">
        The agent only sees knowledge you explicitly grant.
      </p>
      {knowledge.map((item) => (
        <ListRow
          key={item.id}
          title={item.sourceLabel || item.sourceId}
          meta={
            item.sourceKind === "knowledge_base"
              ? "Knowledge source"
              : item.sourceKind
          }
          onRemove={() => onRemove(item.id)}
        />
      ))}
      <p className="pt-1 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
        Knowledge sources
      </p>
      {knowledgeBases.map((kb) => {
        const attached = knowledge.some(
          (k) =>
            k.sourceKind === "knowledge_base" && k.sourceId === kb.id,
        );
        return (
          <button
            key={kb.id}
            type="button"
            disabled={busy || attached}
            className="flex w-full items-center justify-between rounded-[10px] border border-border px-3 py-2 text-left text-[13px] hover:bg-muted disabled:opacity-50"
            onClick={() => onAdd(kb)}
          >
            <span>{kb.name}</span>
            {attached ? (
              <Check className="h-3.5 w-3.5" strokeWidth={1.7} />
            ) : (
              <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
            )}
          </button>
        );
      })}
      {!knowledgeBases.length ? (
        <p className="text-[12.5px] text-muted-foreground">
          No knowledge bases in this workspace yet.
        </p>
      ) : null}
    </div>
  );
}
