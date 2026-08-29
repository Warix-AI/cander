"use client";

import { BuildDashboard } from "@/components/spaces/BuildDashboard";
import { ConnectorsDashboard } from "@/components/spaces/ConnectorsDashboard";
import { ResearchDashboard } from "@/components/spaces/ResearchDashboard";
import { WorkDashboard } from "@/components/spaces/WorkDashboard";
import { useApp } from "@/components/app/AppProvider";
import { cn } from "@/lib/utils";

export function SpaceDashboard({
  enterDirection = "forward",
}: {
  /** forward = enter from right; back = enter from left (leave project). */
  enterDirection?: "forward" | "back";
}) {
  const { spaceId } = useApp();
  const body =
    spaceId === "work" ? (
      <WorkDashboard />
    ) : spaceId === "build" ? (
      <BuildDashboard />
    ) : spaceId === "research" ? (
      <ResearchDashboard />
    ) : spaceId === "connectors" ? (
      <ConnectorsDashboard />
    ) : null;
  if (!body) return null;
  return (
    <div
      key={spaceId ?? "none"}
      className={cn(
        "min-h-0 flex-1",
        enterDirection === "back"
          ? "cander-surface-enter-back"
          : "cander-surface-enter",
      )}
    >
      {body}
    </div>
  );
}
