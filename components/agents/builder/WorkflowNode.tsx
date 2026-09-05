"use client";

import { useEffect, useRef, useState } from "react";
import { Ellipsis, Trash2, Copy, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { StepTypeIcon } from "./AddStepPopover";
import type { WorkflowStep } from "./workflow-model";

const TYPE_LABEL: Record<WorkflowStep["type"], string> = {
  trigger: "Trigger",
  condition: "Condition",
  action: "Action",
  wait: "Wait",
  branch: "Branch",
};

export function WorkflowNode({
  step,
  selected,
  onClick,
  onDuplicate,
  onDisable,
  onDelete,
}: {
  step: WorkflowStep;
  selected?: boolean;
  onClick: () => void;
  onDuplicate: () => void;
  onDisable: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div
      data-canvas-node
      className={cn(
        "group relative w-full rounded-[14px] border bg-background text-left shadow-[0_8px_24px_rgba(0,0,0,0.04)] transition-colors",
        selected
          ? "border-foreground/35 ring-1 ring-foreground/10"
          : "border-border hover:border-foreground/20",
        step.status === "disabled" && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex w-full cursor-pointer items-start gap-2.5 px-3.5 py-3 text-left"
      >
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-muted">
          <StepTypeIcon type={step.type} className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
              {TYPE_LABEL[step.type]}
            </p>
            <StatusDot status={step.status} />
          </div>
          <p
            className={cn(
              "mt-0.5 truncate text-[13.5px] font-medium tracking-[-0.02em]",
              step.status === "incomplete" && "text-muted-foreground",
            )}
          >
            {step.title}
          </p>
          {step.subtitle ? (
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
              {step.subtitle}
            </p>
          ) : null}
        </div>
      </button>

      <div ref={menuRef} className="absolute top-2 right-2">
        <button
          type="button"
          aria-label="Step options"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-muted hover:text-foreground",
            menuOpen || selected
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100",
          )}
        >
          <Ellipsis className="h-3.5 w-3.5" strokeWidth={1.7} />
        </button>
        {menuOpen ? (
          <div className="absolute top-full right-0 z-20 mt-1 w-36 overflow-hidden rounded-[10px] border border-border bg-background py-1 shadow-md">
            <MenuItem
              icon={<Copy className="h-3.5 w-3.5" strokeWidth={1.6} />}
              label="Duplicate"
              onClick={() => {
                setMenuOpen(false);
                onDuplicate();
              }}
            />
            <MenuItem
              icon={<Ban className="h-3.5 w-3.5" strokeWidth={1.6} />}
              label={step.enabled ? "Disable step" : "Enable step"}
              onClick={() => {
                setMenuOpen(false);
                onDisable();
              }}
            />
            <MenuItem
              icon={<Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />}
              label="Delete"
              danger
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: WorkflowStep["status"] }) {
  return (
    <span
      className={cn(
        "h-1.5 w-1.5 rounded-full",
        status === "configured" && "bg-emerald-500",
        status === "incomplete" && "bg-amber-500/80",
        status === "disabled" && "bg-muted-foreground/40",
      )}
    />
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] hover:bg-muted",
        danger && "text-destructive",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
