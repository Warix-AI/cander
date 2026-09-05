"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  LoaderCircle,
  Plus,
  Trash2,
} from "lucide-react";
import {
  applyAgentConfigPatchClient,
  createProjectAgentClient,
  deleteProjectAgentClient,
  duplicateProjectAgentClient,
  listProjectAgentsClient,
  loadAgentBundleClient,
  proposeAgentConfigClient,
  updateProjectAgentClient,
} from "@/lib/agents/client";
import type {
  AgentConfigPatch,
  AgentConfigProposal,
  AgentRoute,
  ProjectAgent,
  ProjectAgentBundle,
} from "@/lib/agents/types";
import { fetchConnectorConnections } from "@/lib/api/connector-client";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { toolsForConnector } from "@/lib/connectors/tool-catalog";
import { policyFor } from "@/lib/workspace-policy";
import { Dropdown } from "@/components/ui/Controls";
import { cn } from "@/lib/utils";
import { BROWSER_CHROME_BG } from "@/lib/shell-chrome";

type ChatLine = {
  id: string;
  role: "user" | "assistant";
  text: string;
  proposal?: AgentConfigProposal;
};

export function AgentBuilderPanel({
  workspaceId,
  projectId,
  projectTitle,
}: {
  workspaceId: string;
  projectId: string;
  projectTitle?: string;
}) {
  const [agents, setAgents] = useState<ProjectAgent[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ProjectAgentBundle | null>(null);
  const [connections, setConnections] = useState<ConnectorConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedConnector, setExpandedConnector] = useState<string | null>(
    null,
  );
  const [chatInput, setChatInput] = useState("");
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);
  const [pendingProposal, setPendingProposal] =
    useState<AgentConfigProposal | null>(null);

  const knowledgeBases = policyFor(workspaceId).knowledgeBases;

  const refreshAgents = async (preferId?: string | null) => {
    const list = await listProjectAgentsClient({ workspaceId, projectId });
    setAgents(list);
    const nextId =
      (preferId && list.some((a) => a.id === preferId) && preferId) ||
      list[0]?.id ||
      null;
    setActiveId(nextId);
    return nextId;
  };

  const refreshBundle = async (agentId: string) => {
    const next = await loadAgentBundleClient({
      workspaceId,
      projectId,
      agentId,
    });
    setBundle(next);
    return next;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [list, conns] = await Promise.all([
          listProjectAgentsClient({ workspaceId, projectId }),
          fetchConnectorConnections(workspaceId).catch(() => []),
        ]);
        if (cancelled) return;
        setAgents(list);
        setConnections(conns.filter((c) => c.status === "active"));
        const id = list[0]?.id ?? null;
        setActiveId(id);
        if (id) {
          const next = await loadAgentBundleClient({
            workspaceId,
            projectId,
            agentId: id,
          });
          if (!cancelled) setBundle(next);
        } else {
          setBundle(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load agents.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, projectId]);

  useEffect(() => {
    if (!activeId || loading) return;
    let cancelled = false;
    void loadAgentBundleClient({ workspaceId, projectId, agentId: activeId })
      .then((next) => {
        if (!cancelled) setBundle(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load agent.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, workspaceId, projectId, loading]);

  const active = bundle?.agent ?? agents.find((a) => a.id === activeId) ?? null;

  const toolMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const t of bundle?.tools ?? []) {
      map.set(`${t.connectionId}:${t.toolId}`, t.enabled);
    }
    return map;
  }, [bundle?.tools]);

  const connectorEnabled = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const c of bundle?.connectors ?? []) {
      map.set(c.connectionId, c.enabled);
    }
    return map;
  }, [bundle?.connectors]);

  const runBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const saveIdentity = async (
    patch: Partial<{
      name: string;
      description: string;
      instructions: string;
      enabled: boolean;
    }>,
  ) => {
    if (!activeId) return;
    await runBusy(async () => {
      const agent = await updateProjectAgentClient({
        workspaceId,
        projectId,
        agentId: activeId,
        patch,
      });
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? agent : a)));
      setBundle((prev) => (prev ? { ...prev, agent } : prev));
    });
  };

  const applyPatch = async (patch: AgentConfigPatch, confirmed = false) => {
    if (!activeId) return;
    await runBusy(async () => {
      const identityOnly =
        Object.keys(patch).every((k) =>
          ["name", "description", "instructions", "enabled"].includes(k),
        );
      if (identityOnly) {
        const agent = await updateProjectAgentClient({
          workspaceId,
          projectId,
          agentId: activeId,
          patch: {
            name: patch.name,
            description: patch.description,
            instructions: patch.instructions,
            enabled: patch.enabled,
          },
        });
        setAgents((prev) => prev.map((a) => (a.id === agent.id ? agent : a)));
        setBundle((prev) => (prev ? { ...prev, agent } : prev));
        setPendingProposal(null);
        return;
      }
      const next = await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId: activeId,
        patch,
        confirmed: confirmed || undefined,
      });
      setBundle(next);
      setAgents((prev) =>
        prev.map((a) => (a.id === next.agent.id ? next.agent : a)),
      );
      setPendingProposal(null);
    });
  };

  if (loading) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center",
          BROWSER_CHROME_BG,
        )}
      >
        <LoaderCircle
          className="h-6 w-6 animate-spin text-muted-foreground"
          strokeWidth={1.75}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden",
        BROWSER_CHROME_BG,
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="mx-auto flex max-w-xl flex-col gap-5">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                Agent builder
              </p>
              <p className="mt-0.5 truncate text-[15px] font-medium tracking-[-0.02em]">
                {projectTitle ?? "Agent project"}
              </p>
            </div>
            <Dropdown
              align="end"
              matchTrigger={false}
              trigger={({ toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  className="inline-flex h-8 max-w-[12rem] items-center gap-1.5 rounded-[10px] border border-border bg-background px-2.5 text-[12.5px] font-medium hover:bg-muted"
                >
                  <Bot className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
                  <span className="truncate">{active?.name ?? "Agent"}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                </button>
              )}
            >
              {(close) => (
              <div className="min-w-[14rem] p-1">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between rounded-[8px] px-2.5 py-1.5 text-left text-[13px] hover:bg-muted",
                      agent.id === activeId && "bg-muted",
                    )}
                    onClick={() => {
                      setActiveId(agent.id);
                      close();
                    }}
                  >
                    <span className="truncate">{agent.name}</span>
                    {!agent.enabled ? (
                      <span className="text-[11px] text-muted-foreground">
                        Off
                      </span>
                    ) : null}
                  </button>
                ))}
                <div className="my-1 border-t border-border" />
                <MenuAction
                  label="New agent"
                  icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.6} />}
                  disabled={busy}
                  onClick={() => {
                    close();
                    void runBusy(async () => {
                      const agent = await createProjectAgentClient({
                        workspaceId,
                        projectId,
                        name: `Agent ${agents.length + 1}`,
                      });
                      await refreshAgents(agent.id);
                      await refreshBundle(agent.id);
                    });
                  }}
                />
                <MenuAction
                  label="Rename"
                  disabled={busy || !active}
                  onClick={() => {
                    close();
                    if (!active) return;
                    const next = window.prompt("Agent name", active.name);
                    if (!next?.trim()) return;
                    void saveIdentity({ name: next.trim() });
                  }}
                />
                <MenuAction
                  label="Duplicate"
                  icon={<Copy className="h-3.5 w-3.5" strokeWidth={1.6} />}
                  disabled={busy || !activeId}
                  onClick={() => {
                    close();
                    void runBusy(async () => {
                      if (!activeId) return;
                      const next = await duplicateProjectAgentClient({
                        workspaceId,
                        projectId,
                        agentId: activeId,
                      });
                      await refreshAgents(next.agent.id);
                      setBundle(next);
                    });
                  }}
                />
                <MenuAction
                  label={active?.enabled ? "Disable" : "Enable"}
                  disabled={busy || !active}
                  onClick={() => {
                    close();
                    void saveIdentity({ enabled: !active?.enabled });
                  }}
                />
                <MenuAction
                  label="Delete"
                  danger
                  icon={<Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />}
                  disabled={busy || agents.length <= 1 || !activeId}
                  onClick={() => {
                    close();
                    void runBusy(async () => {
                      if (!activeId || agents.length <= 1) return;
                      if (!window.confirm("Delete this agent?")) return;
                      await deleteProjectAgentClient({
                        workspaceId,
                        projectId,
                        agentId: activeId,
                      });
                      const nextId = await refreshAgents(null);
                      if (nextId) await refreshBundle(nextId);
                      else setBundle(null);
                    });
                  }}
                />
              </div>
              )}
            </Dropdown>
          </header>

          {error ? (
            <p className="rounded-[10px] border border-border bg-background px-3 py-2 text-[12.5px] text-destructive">
              {error}
            </p>
          ) : null}

          {active ? (
            <>
              <Section title="Identity">
                <Field
                  label="Name"
                  value={active.name}
                  onCommit={(value) => void saveIdentity({ name: value })}
                />
                <Field
                  label="Description"
                  value={active.description}
                  onCommit={(value) =>
                    void saveIdentity({ description: value })
                  }
                />
                <label className="block">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    Instructions
                  </span>
                  <textarea
                    key={`${active.id}-instructions`}
                    defaultValue={active.instructions}
                    rows={5}
                    className="mt-1 w-full resize-y rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground/30"
                    onBlur={(event) => {
                      const next = event.target.value;
                      if (next !== active.instructions) {
                        void saveIdentity({ instructions: next });
                      }
                    }}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-background px-3 py-2">
                  <span className="text-[13px]">Enabled</span>
                  <input
                    type="checkbox"
                    checked={active.enabled}
                    onChange={(event) =>
                      void saveIdentity({ enabled: event.target.checked })
                    }
                  />
                </label>
              </Section>

              <Section title="Skills">
                <div className="space-y-1.5">
                  {(bundle?.skills ?? []).map((skill) => (
                    <Row
                      key={skill.id}
                      title={skill.skillLabel || skill.skillId}
                      meta={skill.skillId}
                      onRemove={() =>
                        void applyPatch(
                          { removeSkillIds: [skill.skillId] },
                          true,
                        )
                      }
                    />
                  ))}
                  {!bundle?.skills.length ? (
                    <p className="text-[12.5px] text-muted-foreground">
                      No skills attached yet.
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border bg-background px-2.5 text-[12.5px] font-medium hover:bg-muted disabled:opacity-50"
                  onClick={() => {
                    const label = window.prompt(
                      "Describe a skill to attach (creates a draft package id)",
                    );
                    if (!label?.trim()) return;
                    const skillLabel = label.trim();
                    void applyPatch(
                      {
                        addSkills: [
                          {
                            skillId: `skill_${skillLabel
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, "_")}`,
                            skillLabel,
                          },
                        ],
                      },
                      true,
                    );
                  }}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
                  Add skill
                </button>
              </Section>

              <Section title="Knowledge">
                <p className="mb-2 text-[12.5px] text-muted-foreground">
                  Attach sources explicitly — nothing is included by default.
                </p>
                <div className="space-y-1.5">
                  {(bundle?.knowledge ?? []).map((item) => (
                    <Row
                      key={item.id}
                      title={item.sourceLabel || item.sourceId}
                      meta={item.sourceKind}
                      onRemove={() =>
                        void applyPatch(
                          { removeKnowledgeIds: [item.id] },
                          true,
                        )
                      }
                    />
                  ))}
                </div>
                {knowledgeBases.length ? (
                  <div className="mt-2 space-y-1">
                    {knowledgeBases.map((kb) => {
                      const attached = bundle?.knowledge.some(
                        (k) =>
                          k.sourceKind === "knowledge_base" &&
                          k.sourceId === kb.id,
                      );
                      return (
                        <button
                          key={kb.id}
                          type="button"
                          disabled={busy || attached}
                          className="flex w-full items-center justify-between rounded-[10px] border border-border bg-background px-3 py-2 text-left text-[13px] hover:bg-muted disabled:opacity-50"
                          onClick={() =>
                            void applyPatch(
                              {
                                addKnowledge: [
                                  {
                                    sourceKind: "knowledge_base",
                                    sourceId: kb.id,
                                    sourceLabel: kb.name,
                                  },
                                ],
                              },
                              true,
                            )
                          }
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
                  </div>
                ) : (
                  <p className="text-[12.5px] text-muted-foreground">
                    No knowledge bases in this workspace yet.
                  </p>
                )}
              </Section>

              <Section title="Access">
                {!connections.length ? (
                  <p className="text-[12.5px] text-muted-foreground">
                    Install connectors to grant tools to this agent.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {connections.map((conn) => {
                      const enabled = connectorEnabled.get(conn.id) ?? false;
                      const open = expandedConnector === conn.id;
                      const tools = toolsForConnector(conn.connectorId);
                      return (
                        <div
                          key={conn.id}
                          className="rounded-[10px] border border-border bg-background"
                        >
                          <div className="flex items-center gap-2 px-3 py-2">
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              onClick={() =>
                                setExpandedConnector(open ? null : conn.id)
                              }
                            >
                              {open ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                              )}
                              <span className="truncate text-[13px] font-medium">
                                {conn.connectorId}
                              </span>
                            </button>
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(event) =>
                                void applyPatch(
                                  {
                                    setConnectorEnabled: [
                                      {
                                        connectionId: conn.id,
                                        connectorId: conn.connectorId,
                                        enabled: event.target.checked,
                                      },
                                    ],
                                  },
                                  true,
                                )
                              }
                            />
                          </div>
                          {open ? (
                            <div className="space-y-2 border-t border-border px-3 py-2">
                              <div className="flex flex-wrap gap-1.5">
                                <MiniBtn
                                  label="Allow all"
                                  onClick={() =>
                                    void applyPatch(
                                      {
                                        setConnectorEnabled: [
                                          {
                                            connectionId: conn.id,
                                            connectorId: conn.connectorId,
                                            enabled: true,
                                          },
                                        ],
                                        setToolPermissions: tools.map(
                                          (tool) => ({
                                            connectionId: conn.id,
                                            toolId: tool.id,
                                            enabled: true,
                                          }),
                                        ),
                                      },
                                      true,
                                    )
                                  }
                                />
                                <MiniBtn
                                  label="Read only"
                                  onClick={() =>
                                    void applyPatch(
                                      {
                                        setConnectorEnabled: [
                                          {
                                            connectionId: conn.id,
                                            connectorId: conn.connectorId,
                                            enabled: true,
                                          },
                                        ],
                                        setToolPermissions: tools.map(
                                          (tool) => ({
                                            connectionId: conn.id,
                                            toolId: tool.id,
                                            enabled: tool.access === "read",
                                          }),
                                        ),
                                      },
                                      true,
                                    )
                                  }
                                />
                                <MiniBtn
                                  label="Disable all"
                                  onClick={() =>
                                    void applyPatch(
                                      {
                                        setConnectorEnabled: [
                                          {
                                            connectionId: conn.id,
                                            connectorId: conn.connectorId,
                                            enabled: false,
                                          },
                                        ],
                                        setToolPermissions: tools.map(
                                          (tool) => ({
                                            connectionId: conn.id,
                                            toolId: tool.id,
                                            enabled: false,
                                          }),
                                        ),
                                      },
                                      true,
                                    )
                                  }
                                />
                              </div>
                              {tools.map((tool) => {
                                const on =
                                  toolMap.get(`${conn.id}:${tool.id}`) ?? false;
                                return (
                                  <label
                                    key={tool.id}
                                    className="flex items-center justify-between gap-3 text-[12.5px]"
                                  >
                                    <span className="min-w-0 truncate">
                                      {tool.label}
                                      <span className="ml-1 text-muted-foreground">
                                        {tool.access}
                                      </span>
                                    </span>
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      onChange={(event) =>
                                        void applyPatch(
                                          {
                                            setToolPermissions: [
                                              {
                                                connectionId: conn.id,
                                                toolId: tool.id,
                                                enabled: event.target.checked,
                                              },
                                            ],
                                          },
                                          true,
                                        )
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
                )}
              </Section>

              <Section title="Routes">
                <p className="mb-2 text-[12.5px] text-muted-foreground">
                  Saved for a future runtime — triggers are not live yet.
                </p>
                <div className="space-y-2">
                  {(bundle?.routes ?? []).map((route) => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      busy={busy}
                      onSave={(next) =>
                        void applyPatch({ upsertRoutes: [next] }, true)
                      }
                      onDelete={() =>
                        void applyPatch({ deleteRouteIds: [route.id] }, true)
                      }
                    />
                  ))}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border bg-background px-2.5 text-[12.5px] font-medium hover:bg-muted disabled:opacity-50"
                  onClick={() =>
                    void applyPatch(
                      {
                        upsertRoutes: [
                          {
                            name: `Route ${(bundle?.routes.length ?? 0) + 1}`,
                            enabled: true,
                            trigger: {
                              type: "manual",
                              label: "WHEN something happens",
                            },
                            condition: {
                              type: "always",
                              expression: "IF always",
                            },
                            actions: [
                              { type: "notify", label: "DO an action" },
                            ],
                          },
                        ],
                      },
                      true,
                    )
                  }
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
                  Add route
                </button>
              </Section>
            </>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:px-5">
        <div className="mx-auto max-w-xl space-y-2">
          {chatLines.slice(-4).map((line) => (
            <p
              key={line.id}
              className={cn(
                "text-[12.5px]",
                line.role === "user"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <span className="font-medium">
                {line.role === "user" ? "You" : "Config"}:{" "}
              </span>
              {line.text}
            </p>
          ))}
          {pendingProposal ? (
            <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-muted/40 px-3 py-2">
              <p className="flex-1 text-[12.5px]">{pendingProposal.summary}</p>
              <button
                type="button"
                disabled={busy}
                className="h-7 rounded-[8px] bg-primary px-2.5 text-[12px] font-medium text-primary-foreground"
                onClick={() =>
                  void applyPatch(
                    pendingProposal.patch,
                    pendingProposal.requiresConfirmation,
                  )
                }
              >
                {pendingProposal.requiresConfirmation ? "Confirm apply" : "Apply"}
              </button>
              <button
                type="button"
                className="h-7 rounded-[8px] border border-border px-2.5 text-[12px]"
                onClick={() => setPendingProposal(null)}
              >
                Dismiss
              </button>
            </div>
          ) : null}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const message = chatInput.trim();
              if (!message || !activeId || busy) return;
              setChatInput("");
              setChatLines((prev) => [
                ...prev,
                {
                  id: `u_${Date.now()}`,
                  role: "user",
                  text: message,
                },
              ]);
              void runBusy(async () => {
                const proposal = await proposeAgentConfigClient({
                  workspaceId,
                  projectId,
                  agentId: activeId,
                  message,
                });
                setChatLines((prev) => [
                  ...prev,
                  {
                    id: `a_${Date.now()}`,
                    role: "assistant",
                    text: proposal.summary,
                    proposal,
                  },
                ]);
                const keys = Object.keys(proposal.patch);
                if (!keys.length) return;
                if (!proposal.requiresConfirmation) {
                  await applyPatch(proposal.patch, false);
                } else {
                  setPendingProposal(proposal);
                }
              });
            }}
          >
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Propose a config change…"
              className="h-9 min-w-0 flex-1 rounded-[10px] border border-border bg-background px-3 text-[13px] outline-none focus:border-foreground/30"
            />
            <button
              type="submit"
              disabled={busy || !chatInput.trim() || !activeId}
              className="h-9 rounded-[10px] bg-primary px-3 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
      <input
        key={`${label}-${value}`}
        defaultValue={value}
        className="mt-1 h-9 w-full rounded-[10px] border border-border bg-background px-3 text-[13px] outline-none focus:border-foreground/30"
        onBlur={(event) => {
          const next = event.target.value;
          if (next !== value) onCommit(next);
        }}
      />
    </label>
  );
}

function Row({
  title,
  meta,
  onRemove,
}: {
  title: string;
  meta?: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-border bg-background px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px]">{title}</p>
        {meta ? (
          <p className="truncate text-[11px] text-muted-foreground">{meta}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Remove"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
      </button>
    </div>
  );
}

function MenuAction({
  label,
  onClick,
  disabled,
  danger,
  icon,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[13px] hover:bg-muted disabled:opacity-40",
        danger && "text-destructive",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function MiniBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-7 rounded-[8px] border border-border px-2 text-[11.5px] font-medium hover:bg-muted"
    >
      {label}
    </button>
  );
}

function RouteCard({
  route,
  busy,
  onSave,
  onDelete,
}: {
  route: AgentRoute;
  busy: boolean;
  onSave: (route: AgentRoute) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(route.name);
  const [whenLabel, setWhenLabel] = useState(
    route.trigger.label || "WHEN something happens",
  );
  const [ifLabel, setIfLabel] = useState(
    route.condition.expression || "IF always",
  );
  const [doLabel, setDoLabel] = useState(
    route.actions[0]?.label || "DO an action",
  );

  useEffect(() => {
    setName(route.name);
    setWhenLabel(route.trigger.label || "WHEN something happens");
    setIfLabel(route.condition.expression || "IF always");
    setDoLabel(route.actions[0]?.label || "DO an action");
  }, [route]);

  return (
    <div className="space-y-2 rounded-[10px] border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-[8px] border border-border px-2 text-[13px]"
        />
        <button
          type="button"
          disabled={busy}
          className="h-8 rounded-[8px] border border-border px-2 text-[12px] font-medium hover:bg-muted disabled:opacity-50"
          onClick={() =>
            onSave({
              ...route,
              name: name.trim() || "Route",
              trigger: {
                ...route.trigger,
                type: route.trigger.type || "manual",
                label: whenLabel,
              },
              condition: {
                ...route.condition,
                type: route.condition.type || "always",
                expression: ifLabel,
              },
              actions: [
                {
                  ...(route.actions[0] ?? {}),
                  type: route.actions[0]?.type || "notify",
                  label: doLabel,
                },
              ],
            })
          }
        >
          Save
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-muted"
          aria-label="Delete route"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
        </button>
      </div>
      <StackField label="WHEN" value={whenLabel} onChange={setWhenLabel} />
      <StackField label="IF" value={ifLabel} onChange={setIfLabel} />
      <StackField label="DO" value={doLabel} onChange={setDoLabel} />
    </div>
  );
}

function StackField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-[8px] border border-dashed border-border px-2.5 py-2">
      <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full bg-transparent text-[13px] outline-none"
      />
    </label>
  );
}
