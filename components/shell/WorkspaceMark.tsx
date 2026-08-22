"use client";

import { useSyncExternalStore } from "react";
import {
  getWorkspaceIconsServerSnapshot,
  getWorkspaceIconsSnapshot,
  subscribeWorkspaceIcons,
  workspaceIconFor,
} from "@/lib/workspace-icons";
import { cn } from "@/lib/utils";

const workspaceTint: Record<string, string> = {
  marketing: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  engineering: "bg-chart-2/15 text-foreground",
  operations: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export function workspaceInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

export function WorkspaceMark({
  id,
  name,
  active = false,
  size = "md",
  className,
}: {
  id: string;
  name: string;
  active?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const icons = useSyncExternalStore(
    subscribeWorkspaceIcons,
    getWorkspaceIconsSnapshot,
    getWorkspaceIconsServerSnapshot,
  );
  const icon = workspaceIconFor(id, icons);
  const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-[11px]";

  if (icon) {
    return (
      <span
        className={cn(
          "relative inline-flex shrink-0 overflow-hidden rounded-[10px]",
          dim,
          active && "ring-2 ring-foreground/15 ring-offset-1 ring-offset-sidebar",
          className,
        )}
      >
        <img src={icon} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[10px] font-semibold tracking-[-0.02em]",
        dim,
        active
          ? "bg-sidebar-accent text-foreground ring-2 ring-foreground/15 ring-offset-1 ring-offset-sidebar"
          : workspaceTint[id] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {workspaceInitials(name)}
    </span>
  );
}
