"use client";

import { BuildPanel } from "@/components/panels/BuildPanel";
import { ResearchPanel } from "@/components/panels/ResearchPanel";
import { SkillsPanel } from "@/components/panels/SkillsPanel";
import { StudioPanel } from "@/components/panels/StudioPanel";
import { useApp } from "@/components/app/AppProvider";
import { cn } from "@/lib/utils";

export function ContextPanel() {
  const { spaceId, dragging } = useApp();

  return (
    <aside
      className={cn(
        "flex h-full min-w-0 flex-col border-l border-border bg-card",
        !dragging &&
          "transition-[width] duration-[550ms] ease-[cubic-bezier(0.25,0.1,0.25,1)]",
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {spaceId === "studio" ? (
          <StudioPanel />
        ) : spaceId === "research" ? (
          <ResearchPanel />
        ) : spaceId === "skills" ? (
          <SkillsPanel />
        ) : (
          <BuildPanel />
        )}
      </div>
    </aside>
  );
}

export function ResizeHandle() {
  const { setPanelRatio, setDragging, panelMode } = useApp();
  if (panelMode === "collapsed" || panelMode === "immersive") return null;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      className="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize"
      onMouseDown={(event) => {
        event.preventDefault();
        setDragging(true);
        const onMove = (move: MouseEvent) => {
          const main = document.getElementById("courier-main");
          if (!main) return;
          const rect = main.getBoundingClientRect();
          const next = (rect.right - move.clientX) / rect.width;
          setPanelRatio(Math.min(0.72, Math.max(0.28, next)));
        };
        const onUp = () => {
          setDragging(false);
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}
    >
      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent group-hover:bg-chart-2/50 hover:bg-chart-2/50" />
    </div>
  );
}
