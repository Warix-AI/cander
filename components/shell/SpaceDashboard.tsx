"use client";

import { BuildDashboard } from "@/components/spaces/BuildDashboard";
import { ConnectorsDashboard } from "@/components/spaces/ConnectorsDashboard";
import { ResearchDashboard } from "@/components/spaces/ResearchDashboard";
import { ScheduledDashboard } from "@/components/spaces/ScheduledDashboard";
import { SkillsDashboard } from "@/components/spaces/SkillsDashboard";
import { StudioDashboard } from "@/components/spaces/StudioDashboard";
import { useApp } from "@/components/app/AppProvider";

export function SpaceDashboard() {
  const { spaceId } = useApp();
  if (spaceId === "build") return <BuildDashboard />;
  if (spaceId === "studio") return <StudioDashboard />;
  if (spaceId === "research") return <ResearchDashboard />;
  if (spaceId === "skills") return <SkillsDashboard />;
  if (spaceId === "connectors") return <ConnectorsDashboard />;
  if (spaceId === "scheduled") return <ScheduledDashboard />;
  return null;
}
