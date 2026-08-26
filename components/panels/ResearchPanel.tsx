"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { BrowserEngine } from "@/components/browser/BrowserEngine";
import { PanelChrome } from "@/components/panels/PanelChrome";
import { SpaceLibraryPanel } from "@/components/panels/SpaceLibraryPanel";
import { Row } from "@/components/panels/Bits";
import { SegTabs } from "@/components/ui/Controls";
import { useSpaceSources } from "@/lib/hooks/use-space-query";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
import type { ResearchTool } from "@/lib/types";
import { useMobileShell } from "@/lib/use-media-query";
import { SHELL_PANEL_BODY, SHELL_PANEL_SCROLL } from "@/lib/shell-chrome";

const tools: { id: ResearchTool; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "browser", label: "Browser" },
  { id: "sources", label: "Sources" },
  { id: "notes", label: "Notes" },
  { id: "report", label: "Report" },
];

export function ResearchPanel() {
  const {
    project,
    projectId,
    workspaceId,
    researchTool,
    setResearchTool,
    panelIntent,
    openSpaceEntity,
    newChat,
  } = useApp();
  const mobile = useMobileShell();
  const execute = panelIntent === "execute";
  const { data: sources, loading: sourcesLoading } = useSpaceSources({
    space: "research",
    projectId: projectId ?? undefined,
  });
  const notes = useMemo(
    () => sources.filter((item) => item.kind === "note"),
    [sources],
  );
  const reports = useMemo(
    () => sources.filter((item) => item.kind === "report"),
    [sources],
  );
  const webSources = useMemo(
    () => sources.filter((item) => item.kind === "web" || item.kind === "pdf"),
    [sources],
  );
  const [savedHint, setSavedHint] = useState<string | null>(null);

  if ((!project || project.space !== "research") && !execute) {
    return <SpaceLibraryPanel />;
  }

  const tool =
    execute && (researchTool === "overview" || !researchTool)
      ? "browser"
      : researchTool;
  const tabs = (
    <SegTabs
      items={tools}
      value={tool}
      onChange={(id) => setResearchTool(id as ResearchTool)}
    />
  );

  return (
    <div className={SHELL_PANEL_BODY}>
      <PanelChrome
        kicker="Explore"
        title={project?.name ?? "New brief"}
        trailing={mobile ? tabs : undefined}
      />
      {!mobile ? (
        <div className="border-b border-border px-2 py-1.5">{tabs}</div>
      ) : null}
      {savedHint ? (
        <p className="border-b border-border px-4 py-2 text-[12px] text-muted-foreground">
          Saved {savedHint} to sources.
        </p>
      ) : null}
      <div className={SHELL_PANEL_SCROLL}>
        {tool === "overview" ? (
          <div className="p-4">
            <p className="text-[14px] font-medium tracking-[-0.02em]">
              {project?.summary ?? "Start a research brief or browse the web."}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {webSources.length} sources · {notes.length} notes ·{" "}
              {reports.length} reports
            </p>
            <button
              type="button"
              onClick={() => setResearchTool("browser")}
              className="mt-4 inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:bg-foreground"
            >
              Browse
            </button>
          </div>
        ) : null}

        {tool === "browser" ? (
          <BrowserEngine
            projectId={projectId}
            projectTitle={project?.name}
            onCapture={({ sourceId, page }) => {
              setSavedHint(page.title);
              openSpaceEntity({
                type: "source",
                id: sourceId,
                space: "research",
                workspaceId,
                label: page.title,
                snapshot: page.url,
              });
            }}
          />
        ) : null}

        {tool === "sources" ? (
          sourcesLoading ? (
            <QuerySkeleton rows={4} />
          ) : (
            <div className="py-2">
              {webSources.length ? (
                webSources.map((source) => (
                  <Row
                    key={source.id}
                    title={source.title}
                    meta={source.url?.replace(/^https?:\/\//, "") ?? "Saved"}
                  />
                ))
              ) : (
                <p className="px-4 py-3 text-[13px] text-muted-foreground">
                  No sources yet. Browse and tap Save source.
                </p>
              )}
            </div>
          )
        ) : null}

        {tool === "notes" ? (
          <div className="py-2">
            {notes.length ? (
              notes.map((note) => (
                <Row key={note.id} title={note.title} meta="Note" />
              ))
            ) : (
              <p className="px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
                Notes appear here when you save research takeaways.
              </p>
            )}
          </div>
        ) : null}

        {tool === "report" ? (
          <div className="p-4">
            {reports.length ? (
              reports.map((report) => (
                <div key={report.id} className="mb-4">
                  <p className="text-[15px] font-medium tracking-[-0.02em]">
                    {report.title}
                  </p>
                  <p className="mt-2 font-mono text-[12px] text-muted-foreground">
                    {(report.citationMeta?.lines as string[] | undefined)?.join(
                      "\n",
                    ) ?? "Report draft"}
                  </p>
                </div>
              ))
            ) : (
              <>
                <p className="text-[15px] font-medium tracking-[-0.02em]">
                  Pricing comparison
                </p>
                <p className="mt-2 font-mono text-[12px] text-muted-foreground">
                  OpenAI · usage
                  <br />
                  Cloud · flat
                  <br />
                  Cander Studio · $79
                </p>
                <button
                  type="button"
                  onClick={() => newChat("research")}
                  className="mt-4 text-[13px] font-medium underline-offset-2 hover:underline"
                >
                  Generate report in chat
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
