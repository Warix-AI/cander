"use client";

import { BuildPanel } from "@/components/panels/BuildPanel";
import { ConnectorsPanel } from "@/components/panels/ConnectorsPanel";
import { AppleHealthConnectorPanel } from "@/components/panels/AppleHealthConnectorPanel";
import { GmailPanel } from "@/components/panels/gmail/GmailPanel";
import { HandshakePanel } from "@/components/panels/handshake/HandshakePanel";
import { PanelChoiceState } from "@/components/panels/PanelChoiceState";
import { PanelEmptyState } from "@/components/panels/PanelEmptyState";
import { StandaloneBrowserPanel } from "@/components/browser/StandaloneBrowserPanel";
import { ResearchPanel } from "@/components/panels/ResearchPanel";
import { WorkPanel } from "@/components/panels/WorkPanel";
import { ScheduledPanel } from "@/components/panels/ScheduledPanel";
import { SkillsPanel } from "@/components/panels/SkillsPanel";
import { useApp } from "@/components/app/AppProvider";
import { SplitHandle } from "@/components/shell/SplitHandle";
import { MOBILE_APP_BG } from "@/lib/mobile-menu-styles";
import { useMobileShell } from "@/lib/use-media-query";
import { SHELL_G3_RADIUS, useShellStyle } from "@/lib/shell-chrome";
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
    panelMode,
    standaloneBrowserOpen,
  } = useApp();
  const shell = useShellStyle();
  const mobile = useMobileShell();
  const floatingChrome = shell === "floating" && !mobile;

  const showChoice =
    view === "chat" &&
    !spaceId &&
    !projectId &&
    panelMode !== "collapsed";

  const showEmpty =
    view === "chat" &&
    !thread &&
    !drafting &&
    !projectId &&
    !spaceId &&
    !spaceLibraryOpen &&
    !showChoice;

  const showRecentsEmpty = view === "recents" && !spaceId && !projectId;

  return (
    <aside
      className={cn(
        "@container flex h-full min-h-0 min-w-0 flex-col",
        floatingChrome
          ? cn("light-surface my-3 mr-3 overflow-hidden", SHELL_G3_RADIUS)
          : mobile
            ? cn("overflow-hidden", MOBILE_APP_BG)
            : "overflow-hidden rounded-none border-0 bg-white shadow-none dark:bg-background",
        !dragging &&
          !mobile &&
          "transition-[width] duration-[550ms] ease-[cubic-bezier(0.25,0.1,0.25,1)]",
      )}
    >
      <div className="shell-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        {standaloneBrowserOpen ? (
          <StandaloneBrowserPanel />
        ) : showEmpty || showRecentsEmpty ? (
          <PanelEmptyState />
        ) : showChoice ? (
          <PanelChoiceState />
        ) : spaceId === "research" ? (
          <ResearchPanel />
        ) : spaceId === "build" && skillId ? (
          <SkillsPanel />
        ) : spaceId === "build" && jobId ? (
          <ScheduledPanel />
        ) : spaceId === "connectors" && connectorId === "handshake" ? (
          <HandshakePanel />
        ) : spaceId === "connectors" && connectorId === "gmail" ? (
          <GmailPanel />
        ) : spaceId === "connectors" && connectorId === "apple-health" ? (
          <AppleHealthConnectorPanel />
        ) : spaceId === "connectors" ? (
          <ConnectorsPanel />
        ) : spaceId === "work" ? (
          <WorkPanel />
        ) : (
          <BuildPanel />
        )}
      </div>
    </aside>
  );
}

export function ResizeHandle() {
  const { setPanelRatio, panelMode } = useApp();
  const mobile = useMobileShell();
  if (mobile) return null;
  if (panelMode === "collapsed" || panelMode === "immersive") {
    return null;
  }

  return (
    <SplitHandle
      label="Resize panel"
      from="right"
      min={0.28}
      max={0.72}
      onRatio={setPanelRatio}
    />
  );
}
