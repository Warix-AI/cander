"use client";

import { BuildDashboard } from "@/components/spaces/BuildDashboard";
import { ConnectorsDashboard } from "@/components/spaces/ConnectorsDashboard";
import { ResearchDashboard } from "@/components/spaces/ResearchDashboard";
import { WorkDashboard } from "@/components/spaces/WorkDashboard";
import { useApp } from "@/components/app/AppProvider";

export function SpaceDashboard() {
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
    <div key={spaceId ?? "none"} className="cander-surface-enter min-h-0 flex-1">
      {body}
    </div>
  );
}
