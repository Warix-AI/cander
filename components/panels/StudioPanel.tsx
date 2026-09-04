"use client";

import { useApp } from "@/components/app/AppProvider";
import { PanelChrome } from "@/components/panels/PanelChrome";
import { SpaceLibraryPanel } from "@/components/panels/SpaceLibraryPanel";
import { SHELL_PANEL_BODY, SHELL_PANEL_SCROLL } from "@/lib/shell-chrome";

/** Right panel for Studio when no project browser is filling the space column. */
export function StudioPanel() {
  const { project, panelIntent } = useApp();
  const execute = panelIntent === "execute";

  if ((!project || project.space !== "studio") && !execute) {
    return <SpaceLibraryPanel />;
  }

  return (
    <div className={SHELL_PANEL_BODY}>
      <PanelChrome
        kicker="Create"
        title={project?.name ?? "Studio project"}
      />
      <div className={SHELL_PANEL_SCROLL}>
        <div className="p-4">
          <p className="text-[14px] font-medium tracking-[-0.02em]">
            {project?.summary ?? "Open the browser to collect references and create."}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Studio projects keep browser tabs beside chat — same layout as Home and Build.
          </p>
        </div>
      </div>
    </div>
  );
}
