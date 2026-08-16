"use client";

import { useApp } from "@/components/app/AppProvider";
import { Row, SectionLabel } from "@/components/panels/Bits";
import { SegTabs } from "@/components/ui/Controls";
import { projects } from "@/lib/data";
import type { StudioTool } from "@/lib/types";

const tools: { id: StudioTool; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "generate", label: "Generate" },
  { id: "canvas", label: "Canvas" },
  { id: "retouch", label: "Retouch" },
  { id: "video", label: "Video" },
  { id: "timeline", label: "Timeline" },
  { id: "library", label: "Library" },
  { id: "layers", label: "Layers" },
  { id: "export", label: "Export" },
];

export function StudioPanel() {
  const {
    workspaceId,
    project,
    studioTool,
    setStudioTool,
    openProject,
    panelIntent,
  } = useApp();
  const list = projects.filter(
    (item) => item.space === "studio" && item.workspaceId === workspaceId,
  );
  const execute = panelIntent === "execute";

  if ((!project || project.space !== "studio") && !execute) {
    return (
      <div className="p-3 pt-4">
        <SectionLabel>Projects</SectionLabel>
        {list.map((item) => (
          <Row
            key={item.id}
            title={item.name}
            meta={item.updatedAt}
            onClick={() => openProject(item.id)}
          />
        ))}
      </div>
    );
  }

  const tool = execute && studioTool === "overview" ? "canvas" : studioTool;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2">
        <SegTabs
          items={tools}
          value={tool}
          onChange={(id) => setStudioTool(id as StudioTool)}
        />
      </div>
      {tool === "overview" ? (
        <div className="py-2">
          <Row title="12 stills" meta="Library" />
          <Row title="3 versions" meta="Background off" />
        </div>
      ) : null}
      {tool === "generate" ? (
        <div className="flex flex-1 flex-col p-4">
          <div className="relative flex min-h-[12rem] items-end overflow-hidden rounded-[10px] media-a p-4 text-white">
            <p className="relative text-[13px] text-white/80">
              Describe a still. Courier will drop it on the canvas.
            </p>
          </div>
        </div>
      ) : null}
      {tool === "canvas" ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="relative aspect-[4/5] w-[min(100%,220px)] rounded-lg border border-border bg-muted">
            <div className="absolute inset-8 rounded-lg border border-dashed border-foreground/20" />
            <p className="absolute right-3 bottom-3 font-mono text-[10px] text-muted-foreground">
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
          <div className="relative flex aspect-video items-end overflow-hidden rounded-[10px] media-c p-4 text-white">
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
  );
}
