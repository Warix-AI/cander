"use client";

import { BuildPanel } from "@/components/panels/BuildPanel";
import { ConnectorsPanel } from "@/components/panels/ConnectorsPanel";
import { GmailPanel } from "@/components/panels/gmail/GmailPanel";
import { HandshakePanel } from "@/components/panels/handshake/HandshakePanel";
import { PanelEmptyState } from "@/components/panels/PanelEmptyState";
import { ProjectsBrowser } from "@/components/panels/ProjectsBrowser";
import { ResearchPanel } from "@/components/panels/ResearchPanel";
import { ScheduledPanel } from "@/components/panels/ScheduledPanel";
import { SkillsPanel } from "@/components/panels/SkillsPanel";
import { StudioPanel } from "@/components/panels/StudioPanel";
import { useApp } from "@/components/app/AppProvider";
import { SplitHandle } from "@/components/shell/SplitHandle";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export function ContextPanel() {
  const {
    spaceId,
    connectorId,
    dragging,
    view,
    thread,
    drafting,
    projectId,
    spaceLibraryOpen,
    skillId,
    jobId,
  } = useApp();

  const showEmpty =
    view === "chat" &&
    !thread &&
    !drafting &&
    !projectId &&
    !spaceId &&
    !spaceLibraryOpen;

  const showRecentsEmpty = view === "recents" && !spaceId && !projectId;

  return (
    <aside
      className={cn(
        "@container flex h-full min-h-0 min-w-0 flex-col border-l border-border bg-background",
        !dragging &&
          "transition-[width] duration-[550ms] ease-[cubic-bezier(0.25,0.1,0.25,1)]",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {showEmpty || showRecentsEmpty ? (
          <PanelEmptyState />
        ) : spaceId === "studio" ? (
          <StudioPanel />
        ) : spaceId === "research" ? (
          <ResearchPanel />
        ) : spaceId === "skills" || (spaceId === "build" && skillId) ? (
          <SkillsPanel />
        ) : spaceId === "scheduled" || (spaceId === "build" && jobId) ? (
          <ScheduledPanel />
        ) : spaceId === "connectors" && connectorId === "handshake" ? (
          <HandshakePanel />
        ) : spaceId === "connectors" && connectorId === "gmail" ? (
          <GmailPanel />
        ) : spaceId === "connectors" ? (
          <ConnectorsPanel />
        ) : spaceId === "files" ? (
          <ProjectsBrowser />
        ) : spaceId === "work" ||
          spaceId === "personal" ||
          spaceId === "finances" ||
          spaceId === "health" ? (
          <ProjectsBrowser />
        ) : (
          <BuildPanel />
        )}
      </div>
    </aside>
  );
}

export function ResizeHandle() {
  const { setPanelRatio, panelMode, product, platformDockOpen } = useApp();
  const mobile = useMobileShell();
  const platformChat = product === "platform" && platformDockOpen;
  if (mobile) return null;
  if (
    !platformChat &&
    (panelMode === "collapsed" || panelMode === "immersive")
  ) {
    return null;
  }

  return (
    <SplitHandle
      label="Resize panel"
      from="right"
      min={0.28}
      max={0.72}
      overlay
      onRatio={setPanelRatio}
    />
  );
}
