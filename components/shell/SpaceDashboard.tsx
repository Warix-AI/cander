"use client";

import { BuildDashboard } from "@/components/spaces/BuildDashboard";
import { ConnectorsDashboard } from "@/components/spaces/ConnectorsDashboard";
import { HomeDashboard } from "@/components/spaces/HomeDashboard";
import { ResearchDashboard } from "@/components/spaces/ResearchDashboard";
import { WorkDashboard } from "@/components/spaces/WorkDashboard";
import { useApp } from "@/components/app/AppProvider";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export function SpaceDashboard({
  enterDirection = "forward",
  animateEnter = true,
}: {
  /** forward = enter from right; back = enter from left (leave project). */
  enterDirection?: "forward" | "back";
  /** Set false when a parent already plays the full mobile push/pop. */
  animateEnter?: boolean;
}) {
  const { spaceId } = useApp();
  const mobile = useMobileShell();
  const body =
    spaceId === "home" ? (
      <HomeDashboard />
    ) : spaceId === "work" ? (
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
        mobile &&
          animateEnter &&
          (enterDirection === "back"
            ? "cander-surface-enter-back"
            : "cander-surface-enter"),
      )}
    >
      {body}
    </div>
  );
}
