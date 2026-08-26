"use client";

import { useSyncExternalStore } from "react";
import {
  getWorkspaceIconsServerSnapshot,
  getWorkspaceIconsSnapshot,
  subscribeWorkspaceIcons,
  workspaceIconFor,
} from "@/lib/workspace-icons";
import { cn } from "@/lib/utils";

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
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const icons = useSyncExternalStore(
    subscribeWorkspaceIcons,
    getWorkspaceIconsSnapshot,
    getWorkspaceIconsServerSnapshot,
  );
  const icon = workspaceIconFor(id, icons);
  const dim =
    size === "sm"
      ? "h-[26px] w-[26px] text-[11px]"
      : size === "lg"
        ? "h-10 w-10 text-[13px]"
        : "h-[35px] w-[35px] text-[12px]";

  if (icon) {
    return (
      <span
        className={cn(
          "relative inline-flex shrink-0 overflow-hidden rounded-[10px] border-[0.5px] border-foreground/15",
          dim,
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
        "inline-flex shrink-0 items-center justify-center rounded-[10px] font-semibold tracking-[-0.02em] transition-colors duration-200",
        dim,
        active
          ? "bg-foreground text-background"
          : "light-surface text-foreground/75 dark:bg-muted dark:text-muted-foreground dark:shadow-none",
        className,
      )}
    >
      {workspaceInitials(name)}
    </span>
  );
}
