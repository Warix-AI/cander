"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, LoaderCircle, Pencil, X, Zap } from "lucide-react";
import {
  applyAgentConfigPatchClient,
  loadAgentBundleClient,
  proposeAgentConfigClient,
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
import { policyFor } from "@/lib/workspace-policy";
import { BROWSER_CHROME_BG } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";
import { ActionInspector, WaitInspector } from "./builder/ActionInspector";
import { AgentInspector } from "./builder/AgentInspector";
import {
  BranchInspector,
  ConditionInspector,
} from "./builder/ConditionInspector";
import { TriggerInspector } from "./builder/TriggerInspector";
import { WorkflowCanvas } from "./builder/WorkflowCanvas";
import {
  deleteStep,
  duplicateStep,
  findRouteForStep,
  findStep,
  insertStep,
  parseStepId,
  routesToSteps,
  setStepEnabled,
  type AddStepKind,
  type CanvasSelection,
  type InsertPosition,
} from "./builder/workflow-model";

type SaveState = "idle" | "saving" | "saved" | "error";

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
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [selection, setSelection] = useState<CanvasSelection>({
    type: "agent",
    tab: "agent",
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const [describeBusy, setDescribeBusy] = useState(false);
  const savedClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setSelection({ type: "agent", tab: "agent" });
    setPanelOpen(false);
    setSaveState("idle");

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
      if (savedClearTimer.current) clearTimeout(savedClearTimer.current);
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

  const steps = useMemo(
    () => routesToSteps(bundle?.routes ?? []),
    [bundle?.routes],
  );

  const markSaved = () => {
    setSaveState("saved");
    if (savedClearTimer.current) clearTimeout(savedClearTimer.current);
    savedClearTimer.current = setTimeout(() => setSaveState("idle"), 1600);
  };

  const runSave = async (fn: () => Promise<void>) => {
    setSaveState("saving");
    setError(null);
    try {
      await fn();
      markSaved();
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
    await runSave(async () => {
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
    await runSave(async () => {
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

  const handleAddStep = (position: InsertPosition, kind: AddStepKind) => {
    if (!bundle) return;
    const { upsertRoutes } = insertStep(bundle.routes, position, kind);
    if (!upsertRoutes.length) return;
    void applyPatch({ upsertRoutes }).then(() => {
      // After create, select the new incomplete step once bundle refreshes —
      // applyPatch updates bundle; selection refined in effect below is heavy.
      // Best-effort: open panel on agent if trigger from agent.
      if (position.kind === "after-agent" && kind === "trigger") {
        setPanelOpen(true);
      }
    });
  };

  const handleDeleteStep = (stepId: string) => {
    if (!bundle) return;
    const { upsertRoutes, deleteRouteIds } = deleteStep(bundle.routes, stepId);
    void applyPatch({
      ...(upsertRoutes.length ? { upsertRoutes } : {}),
      ...(deleteRouteIds.length ? { deleteRouteIds } : {}),
    });
    if (selection.type === "step" && selection.stepId === stepId) {
      setSelection({ type: "agent", tab: "agent" });
    }
  };

  const handleDuplicateStep = (stepId: string) => {
    if (!bundle) return;
    const { upsertRoutes } = duplicateStep(bundle.routes, stepId);
    if (upsertRoutes.length) void applyPatch({ upsertRoutes });
  };

  const handleToggleStep = (stepId: string) => {
    if (!bundle) return;
    const step = findStep(steps, stepId);
    if (!step) return;
    const { upsertRoutes } = setStepEnabled(
      bundle.routes,
      stepId,
      !step.enabled,
    );
    if (upsertRoutes.length) void applyPatch({ upsertRoutes });
  };

  const saveRoute = (route: AgentRoute) => {
    void applyPatch({ upsertRoutes: [route] });
  };

  // Keyboard delete selected step
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (selection.type !== "step") return;
      event.preventDefault();
      handleDeleteStep(selection.stepId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- delete uses latest bundle via closure refresh
  }, [selection, bundle?.routes]);

  // After routes update from add, select newest incomplete step
  const prevRouteCount = useRef(bundle?.routes.length ?? 0);
  useEffect(() => {
    const count = bundle?.routes.length ?? 0;
    if (count > prevRouteCount.current) {
      const nextSteps = routesToSteps(bundle?.routes ?? []);
      const incomplete = nextSteps.find((s) => s.status === "incomplete");
      if (incomplete) {
        setSelection({ type: "step", stepId: incomplete.id });
        setPanelOpen(true);
      }
    }
    prevRouteCount.current = count;
  }, [bundle?.routes]);

  const onDescribe = async (message: string) => {
    setDescribeBusy(true);
    setError(null);
    try {
      const proposal = await proposeAgentConfigClient({
        workspaceId,
        projectId,
        agentId,
        message,
      });
      if (proposal.patch) {
        await applyPatch(proposal.patch);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not draft workflow.",
      );
    } finally {
      setDescribeBusy(false);
    }
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
  const selectedStep =
    selection.type === "step" ? findStep(steps, selection.stepId) : null;
  const selectedRoute =
    selection.type === "step"
      ? findRouteForStep(bundle.routes, selection.stepId)
      : null;
  const selectedParsed =
    selection.type === "step" ? parseStepId(selection.stepId) : null;

  const panelHeading =
    selection.type === "agent"
      ? agent.name || "Agent"
      : selectedStep
        ? selectedStep.title
        : "Setup";
  const panelSub =
    selection.type === "agent"
      ? "Setup"
      : selectedStep
        ? selectedStep.type.charAt(0).toUpperCase() + selectedStep.type.slice(1)
        : "Setup";

  return (
    <div className={cn("relative flex h-full min-h-0 overflow-hidden", BROWSER_CHROME_BG)}>
      <WorkflowCanvas
        agent={agent}
        routes={bundle.routes}
        steps={steps}
        selection={selection}
        onSelect={select}
        onAddStep={handleAddStep}
        onDuplicateStep={handleDuplicateStep}
        onToggleStep={handleToggleStep}
        onDeleteStep={handleDeleteStep}
        onDescribe={onDescribe}
        describeBusy={describeBusy}
      />

      {panelOpen ? (
        <aside className="absolute inset-y-3 right-3 z-20 flex w-[min(100%,22.5rem)] flex-col overflow-hidden rounded-[14px] border border-border bg-background shadow-[0_12px_40px_rgba(0,0,0,0.12)] sm:inset-y-4 sm:right-4">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-muted">
              {selection.type === "agent" ? (
                <Bot className="h-4 w-4" strokeWidth={1.6} />
              ) : (
                <Zap className="h-4 w-4" strokeWidth={1.6} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium tracking-[-0.02em]">
                {panelHeading}
              </p>
              <p className="truncate text-[11.5px] text-muted-foreground">
                {panelSub}
                {saveState === "saving" ? " · Saving…" : null}
                {saveState === "saved" ? " · Saved" : null}
                {saveState === "error" ? " · Error saving" : null}
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

          {error ? (
            <p className="mx-3 mt-3 rounded-[10px] border border-border px-2.5 py-2 text-[12px] text-destructive">
              {error}
            </p>
          ) : null}

          {selection.type === "agent" ? (
            <AgentInspector
              tab={selection.tab ?? "agent"}
              onTabChange={(tab) => setSelection({ type: "agent", tab })}
              agent={agent}
              skills={bundle.skills}
              knowledge={bundle.knowledge}
              knowledgeBases={knowledgeBases}
              connections={connections}
              connectorEnabled={connectorEnabled}
              toolMap={toolMap}
              busy={saveState === "saving"}
              onSaveIdentity={(patch) => void saveIdentity(patch)}
              onPatch={(patch) => void applyPatch(patch)}
            />
          ) : selectedRoute && selectedStep && selectedParsed ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {selectedStep.type === "trigger" ? (
                <TriggerInspector
                  route={selectedRoute}
                  connections={connections}
                  busy={saveState === "saving"}
                  onSave={saveRoute}
                />
              ) : null}
              {selectedStep.type === "condition" ? (
                <ConditionInspector
                  route={selectedRoute}
                  busy={saveState === "saving"}
                  onSave={saveRoute}
                />
              ) : null}
              {selectedStep.type === "branch" ? (
                <BranchInspector
                  route={selectedRoute}
                  busy={saveState === "saving"}
                  onSave={saveRoute}
                />
              ) : null}
              {selectedStep.type === "action" ? (
                <ActionInspector
                  route={selectedRoute}
                  stepId={selectedStep.id}
                  connections={connections}
                  busy={saveState === "saving"}
                  onSave={saveRoute}
                />
              ) : null}
              {selectedStep.type === "wait" ? (
                <WaitInspector
                  route={selectedRoute}
                  stepId={selectedStep.id}
                  busy={saveState === "saving"}
                  onSave={saveRoute}
                />
              ) : null}
            </div>
          ) : (
            <p className="px-3 py-4 text-[12.5px] text-muted-foreground">
              Select a step on the canvas.
            </p>
          )}
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => {
            setSelection({ type: "agent", tab: "agent" });
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
