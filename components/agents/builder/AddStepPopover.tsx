"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Clock,
  GitBranch,
  Plus,
  Split,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AddStepKind } from "./workflow-model";

const STEP_OPTIONS: Array<{
  kind: AddStepKind;
  label: string;
  blurb: string;
  Icon: LucideIcon;
}> = [
  {
    kind: "trigger",
    label: "Trigger",
    blurb: "Start the agent when something happens",
    Icon: Zap,
  },
  {
    kind: "condition",
    label: "Condition",
    blurb: "Only continue when something is true",
    Icon: Split,
  },
  {
    kind: "action",
    label: "Action",
    blurb: "Have the agent do something",
    Icon: ArrowRight,
  },
  {
    kind: "branch",
    label: "Branch",
    blurb: "Create different paths",
    Icon: GitBranch,
  },
  {
    kind: "wait",
    label: "Wait",
    blurb: "Pause until a time or event",
    Icon: Clock,
  },
];

export function AddStepButton({
  allowed,
  onPick,
  className,
}: {
  allowed: AddStepKind[];
  onPick: (kind: AddStepKind) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const options = STEP_OPTIONS.filter((o) => allowed.includes(o.kind));

  return (
    <div
      ref={rootRef}
      className={cn("relative flex h-10 items-center justify-center", className)}
      data-canvas-node
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
      <button
        type="button"
        aria-label="Add step"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:border-foreground/30 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
      </button>
      {open ? (
        <div className="absolute top-full left-1/2 z-30 mt-2 w-[min(100vw-2rem,17.5rem)] -translate-x-1/2 overflow-hidden rounded-[12px] border border-border bg-background py-1 shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
          <p className="px-3 py-1.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
            Add step
          </p>
          {options.map(({ kind, label, blurb, Icon }) => (
            <button
              key={kind}
              type="button"
              className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-muted/70"
              onClick={() => {
                setOpen(false);
                onPick(kind);
              }}
            >
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-muted">
                <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium tracking-[-0.01em]">
                  {label}
                </span>
                <span className="block text-[11.5px] text-muted-foreground">
                  {blurb}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StepTypeIcon({
  type,
  className,
}: {
  type: AddStepKind | "agent";
  className?: string;
}): ReactNode {
  const Icon =
    type === "trigger"
      ? Zap
      : type === "condition"
        ? Split
        : type === "branch"
          ? GitBranch
          : type === "wait"
            ? Clock
            : ArrowRight;
  return <Icon className={className} strokeWidth={1.6} />;
}
