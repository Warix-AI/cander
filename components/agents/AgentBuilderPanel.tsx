"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Minus,
  Pencil,
  Plus,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  applyAgentConfigPatchClient,
  loadAgentBundleClient,
  updateProjectAgentClient,
} from "@/lib/agents/client";
import { peekCachedAgentBundle } from "@/lib/agents/cache";
import type {
  AgentConfigPatch,
  AgentRoute,
  ProjectAgentBundle,
} from "@/lib/agents/types";
import { fetchConnectorConnections } from "@/lib/api/connector-client";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { toolsForConnector } from "@/lib/connectors/tool-catalog";
import { policyFor } from "@/lib/workspace-policy";
import { BROWSER_CHROME_BG } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

type CanvasSelection =
  | { type: "identity" }
  | { type: "skills" }
  | { type: "knowledge" }
  | { type: "access" }
  | { type: "route"; routeId: string; focus?: "when" | "if" | "do" };

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.2;
const ZOOM_STEP = 0.1;

export function AgentBuilderPanel({
  workspaceId,
  projectId,
  agentId,
  onTitleChange,
}: {
  workspaceId: string;
  projectId: string;
  agentId: string;
  onTitleChange?: (title: string) => void;
}) {
  const cachedBundle = peekCachedAgentBundle(workspaceId, projectId, agentId);
  const [bundle, setBundle] = useState<ProjectAgentBundle | null>(
    () => cachedBundle,
  );
  const [connections, setConnections] = useState<ConnectorConnection[]>([]);
  const [loading, setLoading] = useState(() => !cachedBundle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<CanvasSelection>({
    type: "identity",
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const [expandedConnector, setExpandedConnector] = useState<string | null>(
    null,
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [panning, setPanning] = useState(false);

  const knowledgeBases = policyFor(workspaceId).knowledgeBases;

  useEffect(() => {
    let cancelled = false;
    const peek = peekCachedAgentBundle(workspaceId, projectId, agentId);
    if (peek) {
      setBundle(peek);
      setLoading(false);
    } else {
      setLoading(true);
      setBundle(null);
    }
    setError(null);
    setSelection({ type: "identity" });
    setPanelOpen(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });

    void loadAgentBundleClient({ workspaceId, projectId, agentId })
      .then((next) => {
        if (cancelled) return;
        setBundle(next);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load agent.");
        if (!peek) setBundle(null);
        setLoading(false);
      });

    void fetchConnectorConnections(workspaceId)
      .then((conns) => {
        if (cancelled) return;
        setConnections(conns.filter((c) => c.status === "active"));
      })
      .catch(() => {
        if (!cancelled) setConnections([]);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, projectId, agentId]);

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
    await runBusy(async () => {
      const agent = await updateProjectAgentClient({
        workspaceId,
        projectId,
        agentId,
        patch,
      });
      setBundle((prev) => (prev ? { ...prev, agent } : prev));
      if (patch.name !== undefined) onTitleChange?.(agent.name);
    });
  };

  const applyPatch = async (patch: AgentConfigPatch) => {
    await runBusy(async () => {
      const identityOnly = Object.keys(patch).every((k) =>
        ["name", "description", "instructions", "enabled"].includes(k),
      );
      if (identityOnly) {
        await saveIdentity({
          name: patch.name,
          description: patch.description,
          instructions: patch.instructions,
          enabled: patch.enabled,
        });
        return;
      }
      const next = await applyAgentConfigPatchClient({
        workspaceId,
        projectId,
        agentId,
        patch,
        confirmed: true,
      });
      setBundle(next);
      if (patch.name) onTitleChange?.(next.agent.name);
    });
  };

  const select = (next: CanvasSelection) => {
    setSelection(next);
    setPanelOpen(true);
  };

  const clampZoom = (value: number) =>
    Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));

  const zoomAt = (nextZoom: number, clientX: number, clientY: number) => {
    const el = viewportRef.current;
    if (!el) {
      setZoom(clampZoom(nextZoom));
      return;
    }
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const z = clampZoom(nextZoom);
    setPan((prev) => ({
      x: px - ((px - prev.x) * z) / zoom,
      y: py - ((py - prev.y) * z) / zoom,
    }));
    setZoom(z);
  };

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        const rect = el.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        setZoom((current) => {
          const z = Math.min(
            MAX_ZOOM,
            Math.max(MIN_ZOOM, Math.round((current + delta) * 100) / 100),
          );
          setPan((prev) => ({
            x: px - ((px - prev.x) * z) / current,
            y: py - ((py - prev.y) * z) / current,
          }));
          return z;
        });
        return;
      }
      setPan((prev) => ({
        x: prev.x - event.deltaX,
        y: prev.y - event.deltaY,
      }));
    };
    el.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => el.removeEventListener("wheel", onNativeWheel);
  }, []);

  // Native non-passive wheel listener owns pan/zoom.

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-canvas-node]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
    setPanning(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  };

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setPanning(false);
  };

  const addRoute = () => {
    const count = bundle?.routes.length ?? 0;
    void applyPatch({
      upsertRoutes: [
        {
          name: `Route ${count + 1}`,
          enabled: true,
          trigger: { type: "manual", label: "WHEN something happens" },
          condition: { type: "always", expression: "IF always" },
          actions: [{ type: "notify", label: "DO an action" }],
        },
      ],
    });
  };

  if (loading && !bundle) {
    return (
      <div
        className={cn("relative h-full overflow-hidden", BROWSER_CHROME_BG)}
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in oklab, var(--foreground) 12%, transparent) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <LoaderCircle
            className="h-5 w-5 animate-spin text-muted-foreground/70"
            strokeWidth={1.75}
          />
        </div>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center px-6 text-center text-[13px] text-muted-foreground",
          BROWSER_CHROME_BG,
        )}
      >
        {error || "Agent not found."}
      </div>
    );
  }

  const agent = bundle.agent;
  const routes = bundle.routes;
  const selectedRoute =
    selection.type === "route"
      ? routes.find((r) => r.id === selection.routeId) ?? null
      : null;

  return (
    <div className={cn("relative flex h-full min-h-0 overflow-hidden", BROWSER_CHROME_BG)}>
      <div
        ref={viewportRef}
        className={cn(
          "relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden",
          panning ? "cursor-grabbing" : "cursor-grab",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.9] dark:opacity-[0.55]"
          style={{
            backgroundImage:
              "radial-gradient(circle, color-mix(in oklch, var(--foreground) 14%, transparent) 1px, transparent 1.2px)",
            backgroundSize: "22px 22px",
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />

        <div
          className="absolute left-1/2 top-16 origin-top"
          style={{
            transform: `translate(calc(-50% + ${pan.x}px), ${pan.y}px) scale(${zoom})`,
            width: "28rem",
            maxWidth: "calc(100vw - 3rem)",
          }}
        >
          <div className="flex flex-col items-stretch pb-24">
            <CanvasCard
              selected={selection.type === "identity"}
              onClick={() => select({ type: "identity" })}
              eyebrow="Agent"
              title={agent.name || "Untitled agent"}
              meta={
                agent.enabled
                  ? agent.description || "Identity & instructions"
                  : "Disabled"
              }
              icon={<Bot className="h-4 w-4" strokeWidth={1.6} />}
              status={agent.enabled ? "ready" : "off"}
            />

            <CanvasJoin onAdd={addRoute} />

            {routes.length === 0 ? (
              <CanvasCard
                selected={false}
                dashed
                onClick={addRoute}
                eyebrow="Route"
                title="Add a route"
                meta="WHEN → IF → DO"
                icon={<Zap className="h-4 w-4" strokeWidth={1.6} />}
              />
            ) : (
              routes.map((route, index) => (
                <div key={route.id} className="contents">
                  {index > 0 ? <CanvasJoin onAdd={addRoute} /> : null}
                  <RouteStack
                    route={route}
                    index={index}
                    selected={
                      selection.type === "route" &&
                      selection.routeId === route.id
                        ? (selection.focus ?? "when")
                        : null
                    }
                    onSelectStep={(focus) =>
                      select({ type: "route", routeId: route.id, focus })
                    }
                  />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1 rounded-[12px] border border-border bg-background/95 p-1 shadow-sm backdrop-blur">
          <ZoomBtn
            label="Zoom out"
            onClick={() => {
              const el = viewportRef.current;
              if (!el) return setZoom(clampZoom(zoom - ZOOM_STEP));
              const rect = el.getBoundingClientRect();
              zoomAt(
                zoom - ZOOM_STEP,
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
              );
            }}
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={1.8} />
          </ZoomBtn>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="min-w-[3.25rem] rounded-[8px] px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ZoomBtn
            label="Zoom in"
            onClick={() => {
              const el = viewportRef.current;
              if (!el) return setZoom(clampZoom(zoom + ZOOM_STEP));
              const rect = el.getBoundingClientRect();
              zoomAt(
                zoom + ZOOM_STEP,
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
              );
            }}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
          </ZoomBtn>
        </div>
      </div>

      {panelOpen ? (
        <aside className="absolute inset-y-3 right-3 z-20 flex w-[min(100%,22.5rem)] flex-col overflow-hidden rounded-[14px] border border-border bg-background shadow-[0_12px_40px_rgba(0,0,0,0.12)] sm:inset-y-4 sm:right-4">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-muted">
              <Bot className="h-4 w-4" strokeWidth={1.6} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium tracking-[-0.02em]">
                {panelTitle(selection, agent.name, selectedRoute)}
              </p>
              <p className="truncate text-[11.5px] text-muted-foreground">
                Setup
              </p>
            </div>
            <button
              type="button"
              aria-label="Close panel"
              onClick={() => setPanelOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={1.7} />
            </button>
          </div>

          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-2 [scrollbar-width:none]">
            {(
              [
                ["identity", "Agent"],
                ["access", "Access"],
                ["skills", "Skills"],
                ["knowledge", "Knowledge"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => select({ type: id })}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium",
                  selection.type === id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {error ? (
              <p className="mb-3 rounded-[10px] border border-border px-2.5 py-2 text-[12px] text-destructive">
                {error}
              </p>
            ) : null}

            {selection.type === "identity" ? (
              <IdentityPanel
                agent={agent}
                busy={busy}
                onSave={(patch) => void saveIdentity(patch)}
              />
            ) : null}

            {selection.type === "skills" ? (
              <SkillsPanel
                skills={bundle.skills}
                busy={busy}
                onAdd={(label) =>
                  void applyPatch({
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
                onRemove={(skillId) =>
                  void applyPatch({ removeSkillIds: [skillId] })
                }
              />
            ) : null}

            {selection.type === "knowledge" ? (
              <KnowledgePanel
                knowledge={bundle.knowledge}
                knowledgeBases={knowledgeBases}
                busy={busy}
                onAdd={(kb) =>
                  void applyPatch({
                    addKnowledge: [
                      {
                        sourceKind: "knowledge_base",
                        sourceId: kb.id,
                        sourceLabel: kb.name,
                      },
                    ],
                  })
                }
                onRemove={(id) =>
                  void applyPatch({ removeKnowledgeIds: [id] })
                }
              />
            ) : null}

            {selection.type === "access" ? (
              <AccessPanel
                connections={connections}
                connectorEnabled={connectorEnabled}
                toolMap={toolMap}
                expandedConnector={expandedConnector}
                setExpandedConnector={setExpandedConnector}
                busy={busy}
                onPatch={(patch) => void applyPatch(patch)}
              />
            ) : null}

            {selection.type === "route" && selectedRoute ? (
              <RoutePanel
                route={selectedRoute}
                focus={selection.focus}
                busy={busy}
                onSave={(next) =>
                  void applyPatch({ upsertRoutes: [next] })
                }
                onDelete={() =>
                  void applyPatch({ deleteRouteIds: [selectedRoute.id] })
                }
              />
            ) : null}
          </div>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => {
            setSelection({ type: "identity" });
            setPanelOpen(true);
          }}
          className="absolute top-4 right-4 z-20 inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-background px-3 text-[12.5px] font-medium shadow-sm hover:bg-muted"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} />
          Setup
        </button>
      )}
    </div>
  );
}

function ZoomBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function panelTitle(
  selection: CanvasSelection,
  agentName: string,
  route: AgentRoute | null,
) {
  if (selection.type === "identity") return agentName || "Agent";
  if (selection.type === "skills") return "Skills";
  if (selection.type === "knowledge") return "Knowledge";
  if (selection.type === "access") return "Access";
  if (selection.type === "route") {
    return route?.name || "Route";
  }
  return "Setup";
}

function CanvasJoin({
  onAdd,
  label = "Add step",
}: {
  onAdd: () => void;
  label?: string;
}) {
  return (
    <div className="relative flex h-10 items-center justify-center" data-canvas-node>
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
      <button
        type="button"
        aria-label={label}
        onClick={onAdd}
        className="relative z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:border-foreground/30 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
      </button>
    </div>
  );
}

function CanvasCard({
  eyebrow,
  title,
  meta,
  icon,
  selected,
  onClick,
  dashed,
  status,
}: {
  eyebrow: string;
  title: string;
  meta?: string;
  icon?: ReactNode;
  selected?: boolean;
  onClick: () => void;
  dashed?: boolean;
  status?: "ready" | "off";
}) {
  return (
    <button
      type="button"
      data-canvas-node
      onClick={onClick}
      className={cn(
        "w-full cursor-pointer rounded-[14px] border bg-background px-3.5 py-3.5 text-left shadow-[0_8px_24px_rgba(0,0,0,0.04)] transition-colors",
        dashed && "border-dashed",
        selected
          ? "border-foreground/35 ring-1 ring-foreground/10"
          : "border-border hover:border-foreground/20",
      )}
    >
      <div className="flex items-start gap-2.5">
        {icon ? (
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-muted">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
              {eyebrow}
            </p>
            {status === "ready" ? (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            ) : null}
            {status === "off" ? (
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[14px] font-medium tracking-[-0.02em]">
            {title}
          </p>
          {meta ? (
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
              {meta}
            </p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function RouteStack({
  route,
  index,
  selected,
  onSelectStep,
}: {
  route: AgentRoute;
  index: number;
  selected: "when" | "if" | "do" | null;
  onSelectStep: (focus: "when" | "if" | "do") => void;
}) {
  const steps = [
    {
      id: "when" as const,
      label: "WHEN",
      value: route.trigger.label || "Something happens",
    },
    {
      id: "if" as const,
      label: "IF",
      value: route.condition.expression || "Always",
    },
    {
      id: "do" as const,
      label: "DO",
      value: route.actions[0]?.label || "An action",
    },
  ];

  return (
    <div
      data-canvas-node
      className="overflow-hidden rounded-[14px] border border-border bg-background shadow-[0_8px_24px_rgba(0,0,0,0.04)]"
    >
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
            Route {index + 1}
          </p>
          <p className="truncate text-[13.5px] font-medium tracking-[-0.02em]">
            {route.name}
          </p>
        </div>
        {!route.enabled ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            Off
          </span>
        ) : null}
      </div>
      <div className="divide-y divide-border">
        {steps.map((step) => (
          <button
            key={step.id}
            type="button"
            onClick={() => onSelectStep(step.id)}
            className={cn(
              "flex w-full cursor-pointer items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/40",
              selected === step.id && "bg-muted/60",
            )}
          >
            <span className="mt-0.5 shrink-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground">
              {step.label}
            </span>
            <span className="min-w-0 flex-1 text-[13px] tracking-[-0.01em]">
              {step.value}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function IdentityPanel({
  agent,
  busy,
  onSave,
}: {
  agent: ProjectAgentBundle["agent"];
  busy: boolean;
  onSave: (
    patch: Partial<{
      name: string;
      description: string;
      instructions: string;
      enabled: boolean;
    }>,
  ) => void;
}) {
  return (
    <div className="space-y-3">
      <Field
        label="Name"
        defaultValue={agent.name}
        disabled={busy}
        onCommit={(value) => onSave({ name: value })}
      />
      <Field
        label="Description"
        defaultValue={agent.description}
        disabled={busy}
        onCommit={(value) => onSave({ description: value })}
      />
      <label className="block">
        <span className="font-mono text-[11px] text-muted-foreground">
          Instructions
        </span>
        <textarea
          key={`${agent.id}-instructions`}
          defaultValue={agent.instructions}
          disabled={busy}
          rows={7}
          className="mt-1 w-full resize-y rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground/30 disabled:opacity-60"
          onBlur={(event) => {
            if (event.target.value !== agent.instructions) {
              onSave({ instructions: event.target.value });
            }
          }}
        />
      </label>
      <label className="flex items-center justify-between gap-3 rounded-[10px] border border-border px-3 py-2.5">
        <span className="text-[13px]">Enabled</span>
        <input
          type="checkbox"
          checked={agent.enabled}
          disabled={busy}
          onChange={(event) => onSave({ enabled: event.target.checked })}
        />
      </label>
    </div>
  );
}

function SkillsPanel({
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
      {skills.map((skill) => (
        <ListRow
          key={skill.id}
          title={skill.skillLabel || skill.skillId}
          meta={skill.skillId}
          onRemove={() => onRemove(skill.skillId)}
        />
      ))}
      {!skills.length ? (
        <p className="text-[12.5px] text-muted-foreground">
          No skills attached yet.
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border px-2.5 text-[12.5px] font-medium hover:bg-muted disabled:opacity-50"
        onClick={() => {
          const label = window.prompt("Describe a skill to attach");
          if (!label?.trim()) return;
          onAdd(label.trim());
        }}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
        Add skill
      </button>
    </div>
  );
}

function KnowledgePanel({
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
        Attach sources explicitly — nothing is included by default.
      </p>
      {knowledge.map((item) => (
        <ListRow
          key={item.id}
          title={item.sourceLabel || item.sourceId}
          meta={item.sourceKind}
          onRemove={() => onRemove(item.id)}
        />
      ))}
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

function AccessPanel({
  connections,
  connectorEnabled,
  toolMap,
  expandedConnector,
  setExpandedConnector,
  busy,
  onPatch,
}: {
  connections: ConnectorConnection[];
  connectorEnabled: Map<string, boolean>;
  toolMap: Map<string, boolean>;
  expandedConnector: string | null;
  setExpandedConnector: (id: string | null) => void;
  busy: boolean;
  onPatch: (patch: AgentConfigPatch) => void;
}) {
  if (!connections.length) {
    return (
      <p className="text-[12.5px] text-muted-foreground">
        Install connectors to grant tools to this agent.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {connections.map((conn) => {
        const enabled = connectorEnabled.get(conn.id) ?? false;
        const open = expandedConnector === conn.id;
        const tools = toolsForConnector(conn.connectorId);
        return (
          <div
            key={conn.id}
            className="rounded-[10px] border border-border"
          >
            <div className="flex items-center gap-2 px-2.5 py-2">
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
                      ["Allow all", true, null],
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

function RoutePanel({
  route,
  focus,
  busy,
  onSave,
  onDelete,
}: {
  route: AgentRoute;
  focus?: "when" | "if" | "do";
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
    <div className="space-y-3">
      <Field
        label="Route name"
        value={name}
        onChange={setName}
        disabled={busy}
      />
      <StackField
        label="WHEN"
        value={whenLabel}
        onChange={setWhenLabel}
        active={focus === "when"}
      />
      <StackField
        label="IF"
        value={ifLabel}
        onChange={setIfLabel}
        active={focus === "if"}
      />
      <StackField
        label="DO"
        value={doLabel}
        onChange={setDoLabel}
        active={focus === "do"}
      />
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={busy}
          className="h-9 flex-1 rounded-[10px] bg-foreground px-3 text-[13px] font-medium text-background disabled:opacity-50"
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
          Save route
        </button>
        <button
          type="button"
          disabled={busy}
          aria-label="Delete route"
          onClick={onDelete}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-border text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  defaultValue,
  value,
  onChange,
  onCommit,
  disabled,
}: {
  label: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  onCommit?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
      <input
        key={onCommit ? `${label}-${defaultValue ?? ""}` : undefined}
        defaultValue={onCommit ? defaultValue : undefined}
        value={onChange ? value : undefined}
        disabled={disabled}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
        onBlur={
          onCommit
            ? (event) => {
                if (event.target.value !== (defaultValue ?? "")) {
                  onCommit(event.target.value);
                }
              }
            : undefined
        }
        className="mt-1 h-9 w-full rounded-[10px] border border-border bg-background px-3 text-[13px] outline-none focus:border-foreground/30 disabled:opacity-60"
      />
    </label>
  );
}

function StackField({
  label,
  value,
  onChange,
  active,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  active?: boolean;
}) {
  return (
    <label
      className={cn(
        "block rounded-[10px] border px-2.5 py-2",
        active ? "border-foreground/30 bg-muted/40" : "border-border",
      )}
    >
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

function ListRow({
  title,
  meta,
  onRemove,
}: {
  title: string;
  meta?: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-border px-3 py-2">
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
