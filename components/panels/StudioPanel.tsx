"use client";

import { useApp } from "@/components/app/AppProvider";
import { BannerWash } from "@/components/spaces/BannerWash";
import { PanelChrome } from "@/components/panels/PanelChrome";
import { SpaceLibraryPanel } from "@/components/panels/SpaceLibraryPanel";
import { Row, SectionLabel } from "@/components/panels/Bits";
import { SegTabs } from "@/components/ui/Controls";
import type { StudioTool } from "@/lib/types";
import { useMobileShell } from "@/lib/use-media-query";
import { SHELL_PANEL_BODY, SHELL_PANEL_SCROLL } from "@/lib/shell-chrome";

const tools: { id: StudioTool; label: string }[] = [
  { id: "canvas", label: "Canvas" },
  { id: "generate", label: "Generate" },
  { id: "retouch", label: "Retouch" },
  { id: "video", label: "Video" },
  { id: "library", label: "Library" },
  { id: "export", label: "Export" },
];

export function StudioPanel() {
  const {
    project,
    studioTool,
    setStudioTool,
    panelIntent,
  } = useApp();
  const execute = panelIntent === "execute";

  if ((!project || project.space !== "studio") && !execute) {
    return <SpaceLibraryPanel />;
  }

  const mobile = useMobileShell();
  const tool = execute && (studioTool === "overview" || !studioTool) ? "canvas" : studioTool;
  const tabs = (
    <SegTabs
      items={tools}
      value={tool}
      onChange={(id) => setStudioTool(id as StudioTool)}
    />
  );

  return (
    <div className={SHELL_PANEL_BODY}>
      <PanelChrome
        kicker="Studio"
        title={project?.name ?? "New canvas"}
        trailing={mobile ? tabs : undefined}
      />
      {!mobile ? (
        <div className="border-b border-border px-2 py-1.5">{tabs}</div>
      ) : null}
      <div className={SHELL_PANEL_SCROLL}>
      {tool === "overview" ? (
        <div className="py-2">
          <Row title="12 stills" meta="Library" />
          <Row title="3 versions" meta="Background off" />
        </div>
      ) : null}
      {tool === "generate" ? (
        <div className="flex flex-1 flex-col p-4">
          <div className="relative flex min-h-[12rem] items-end overflow-hidden rounded-[10px] p-4 text-white">
            <BannerWash space="studio" />
            <p className="relative text-[13px] text-white/80">
              Describe a still. It will drop it on the canvas.
            </p>
          </div>
        </div>
      ) : null}
      {tool === "canvas" ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="relative aspect-[4/5] w-[min(100%,220px)] overflow-hidden rounded-lg border border-border">
            {project ? (
              <div className="absolute inset-0 bg-muted">
                <div className="absolute inset-8 rounded-lg border border-dashed border-foreground/20" />
              </div>
            ) : (
              <BannerWash space="studio" />
            )}
            <p className="absolute right-3 bottom-3 z-10 font-mono text-[10px] text-white/80">
              {project ? "BG removed" : "Empty canvas"}
            </p>
          </div>
        </div>
      ) : null}
      {tool === "retouch" ? (
        <div className="py-2">
          <Row title="Exposure" meta="+0.4" />
          <Row title="Crop" meta="4:5" />
          <Row title="Spot heal" meta="Queued" />
        </div>
      ) : null}
      {tool === "video" ? (
        <div className="p-4">
          <div className="relative flex aspect-video items-end overflow-hidden rounded-[10px] p-4 text-white">
            <BannerWash space="studio" />
            <div className="relative">
              <p className="font-mono text-[11px] tracking-[0.08em] text-white/70 uppercase">
                Text to video
              </p>
              <p className="mt-1 text-[13px] text-white/85">
                00:00 — 00:08 · waiting on the first frame
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {tool === "timeline" ? (
        <div className="p-4">
          <div className="h-16 rounded-lg border border-border bg-muted" />
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            00:00 — 00:08 · Demo Videos
          </p>
        </div>
      ) : null}
      {tool === "library" ? (
        <div className="grid grid-cols-3 gap-2 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-lg border border-border bg-muted"
            />
          ))}
        </div>
      ) : null}
      {tool === "layers" ? (
        <div className="py-2">
          <Row title="Subject" meta="Visible" />
          <Row title="Shadow" meta="Soft" />
          <Row title="Background" meta="Off" />
        </div>
      ) : null}
      {tool === "export" ? (
        <div className="py-2">
          <Row title="PNG · 2048" meta="Ready" />
          <Row title="MP4 · 1080p" meta="Queue" />
        </div>
      ) : null}
      </div>
    </div>
  );
}
