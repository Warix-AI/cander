"use client";

import { BuildDashboard } from "@/components/spaces/BuildDashboard";
import { ConnectorsDashboard } from "@/components/spaces/ConnectorsDashboard";
import { FilesDashboard } from "@/components/spaces/FilesDashboard";
import { ResearchDashboard } from "@/components/spaces/ResearchDashboard";
import { ScheduledDashboard } from "@/components/spaces/ScheduledDashboard";
import { SkillsDashboard } from "@/components/spaces/SkillsDashboard";
import { StudioDashboard } from "@/components/spaces/StudioDashboard";
import { PersonalDashboard } from "@/components/spaces/PersonalDashboard";
import { WorkDashboard } from "@/components/spaces/WorkDashboard";
import { useApp } from "@/components/app/AppProvider";

export function SpaceDashboard() {
  const { spaceId } = useApp();
  if (spaceId === "work") return <WorkDashboard />;
  if (spaceId === "build") return <BuildDashboard />;
  if (spaceId === "studio") return <StudioDashboard />;
  if (spaceId === "research") return <ResearchDashboard />;
  if (spaceId === "files") return <FilesDashboard />;
  if (spaceId === "skills") return <SkillsDashboard />;
  if (spaceId === "personal") return <PersonalDashboard />;
  if (spaceId === "finances") return <PersonalDashboard />;
  if (spaceId === "health") return <PersonalDashboard />;
  if (spaceId === "connectors") return <ConnectorsDashboard />;
  if (spaceId === "scheduled") return <ScheduledDashboard />;
  return null;
}
