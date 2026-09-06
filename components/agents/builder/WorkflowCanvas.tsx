/**
 * Dormant Zapier-style route canvas — kept for a future deterministic-workflow
 * escape hatch. V1 Agents use Skills + scoped tools + Trigger (see AgentBuilderPanel).
 */
"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Minus, Plus, Sparkles } from "lucide-react";
import type { ProjectAgent } from "@/lib/agents/types";
import { cn } from "@/lib/utils";
import { AgentNode } from "./AgentNode";
import { AddStepButton } from "./AddStepPopover";
import { WorkflowNode } from "./WorkflowNode";
import {
  allowedAddKinds,
  type AddStepKind,
  type CanvasSelection,
  type InsertPosition,
  type WorkflowStep,
} from "./workflow-model";
import type { AgentRoute } from "@/lib/agents/types";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.2;
const ZOOM_STEP = 0.1;

export function WorkflowCanvas({
  agent,
  routes,
  steps,
  selection,
  onSelect,
  onAddStep,
  onDuplicateStep,
  onToggleStep,
  onDeleteStep,
  onDescribe,
  describeBusy,
}: {
  agent: ProjectAgent;
  routes: AgentRoute[];
  steps: WorkflowStep[];
  selection: CanvasSelection;
  onSelect: (next: CanvasSelection) => void;
  onAddStep: (position: InsertPosition, kind: AddStepKind) => void;
  onDuplicateStep: (stepId: string) => void;
  onToggleStep: (stepId: string) => void;
  onDeleteStep: (stepId: string) => void;
  onDescribe?: (message: string) => void;
  describeBusy?: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [nl, setNl] = useState("");
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

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

  const agentSelected = selection.type === "agent";

  return (
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
        className="absolute left-1/2 top-14 origin-top"
        style={{
          transform: `translate(calc(-50% + ${pan.x}px), ${pan.y}px) scale(${zoom})`,
          width: "28rem",
          maxWidth: "calc(100vw - 3rem)",
        }}
      >
        <div className="flex flex-col items-stretch pb-28">
          <AgentNode
            agent={agent}
            selected={agentSelected}
            onClick={() => onSelect({ type: "agent", tab: "agent" })}
          />

          <AddStepButton
            allowed={allowedAddKinds(routes, { kind: "after-agent" })}
            onPick={(kind) => onAddStep({ kind: "after-agent" }, kind)}
          />

          {steps.length === 0 ? (
            <p className="px-2 text-center text-[12px] text-muted-foreground/80">
              Add a trigger or action to start building.
            </p>
          ) : null}

          {steps.map((step) => (
            <div key={step.id} className="contents">
              <WorkflowNode
                step={step}
                selected={
                  selection.type === "step" && selection.stepId === step.id
                }
                onClick={() => onSelect({ type: "step", stepId: step.id })}
                onDuplicate={() => onDuplicateStep(step.id)}
                onDisable={() => onToggleStep(step.id)}
                onDelete={() => onDeleteStep(step.id)}
              />
              <AddStepButton
                allowed={allowedAddKinds(routes, {
                  kind: "after-step",
                  stepId: step.id,
                })}
                onPick={(kind) =>
                  onAddStep({ kind: "after-step", stepId: step.id }, kind)
                }
              />
            </div>
          ))}

          {onDescribe ? (
            <div
              data-canvas-node
              className="mt-2 rounded-[12px] border border-border/80 bg-background/90 p-2 shadow-sm"
            >
              <label className="flex items-center gap-2">
                <Sparkles
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  strokeWidth={1.6}
                />
                <input
                  value={nl}
                  disabled={describeBusy}
                  onChange={(event) => setNl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || !nl.trim()) return;
                    event.preventDefault();
                    onDescribe(nl.trim());
                    setNl("");
                  }}
                  placeholder="Describe what you want this agent to do…"
                  className="h-8 min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground/80 disabled:opacity-60"
                />
              </label>
            </div>
          ) : null}
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
