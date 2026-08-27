"use client";

import { BuildDashboard } from "@/components/spaces/BuildDashboard";
import { ConnectorsDashboard } from "@/components/spaces/ConnectorsDashboard";
import { ResearchDashboard } from "@/components/spaces/ResearchDashboard";
import { WorkDashboard } from "@/components/spaces/WorkDashboard";
import { useApp } from "@/components/app/AppProvider";

export function SpaceDashboard() {
  const { spaceId } = useApp();
  if (spaceId === "work") return <WorkDashboard />;
  if (spaceId === "build") return <BuildDashboard />;
  if (spaceId === "research") return <ResearchDashboard />;
  if (spaceId === "connectors") return <ConnectorsDashboard />;
  return null;
}
