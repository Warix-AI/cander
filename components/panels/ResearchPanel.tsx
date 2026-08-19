"use client";

import { useApp } from "@/components/app/AppProvider";
import { PanelChrome } from "@/components/panels/PanelChrome";
import { SpaceLibraryPanel } from "@/components/panels/SpaceLibraryPanel";
import { Row, SectionLabel } from "@/components/panels/Bits";
import { SegTabs } from "@/components/ui/Controls";
import { researchSources } from "@/lib/data";
import type { ResearchTool } from "@/lib/types";

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
    researchTool,
    setResearchTool,
    panelIntent,
  } = useApp();
  const execute = panelIntent === "execute";

  if ((!project || project.space !== "research") && !execute) {
    return <SpaceLibraryPanel />;
  }

  const tool = execute && (researchTool === "overview" || !researchTool) ? "browser" : researchTool;

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <PanelChrome kicker="Research" title={project?.name ?? "New brief"} />
      <div className="border-b border-sidebar-border bg-sidebar px-2 py-1.5">
        <SegTabs
          items={tools}
          value={tool}
          onChange={(id) => setResearchTool(id as ResearchTool)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      {tool === "overview" || tool === "sources" ? (
        <div className="py-2">
          {researchSources.map((source) => (
            <Row key={source.url} title={source.title} meta={source.tag} />
          ))}
        </div>
      ) : null}
      {tool === "browser" ? (
        <div className="p-4">
          <div className="rounded-[10px] border border-border">
            <div className="border-b border-border px-3 py-2 font-mono text-[11px] text-muted-foreground">
              {project ? "openai.com/api/pricing" : "about:blank"}
            </div>
            <div className="p-4">
              <p className="text-[14px] font-medium tracking-[-0.02em]">
                {project
                  ? "Token prices still meter the product."
                  : "Waiting on the first source."}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {project
                  ? `Notes attached to ${project.name}. Courier can fold this into Cander’s pricing page without leaving the project.`
                  : "Research will open pages here as soon as you ask."}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {tool === "notes" ? (
        <p className="p-4 text-[13.5px] leading-relaxed text-muted-foreground">
          Flat-rate beats token shock above ~80M tokens/month. Save this against
          Cander’s $79 Studio plan.
        </p>
      ) : null}
      {tool === "report" ? (
        <div className="p-4">
          <p className="text-[15px] font-medium tracking-[-0.02em]">
            Pricing comparison
          </p>
          <p className="mt-2 font-mono text-[12px] text-muted-foreground">
            OpenAI · usage
            <br />
            Courier Cloud · flat
            <br />
            Cander Studio · $79
          </p>
        </div>
      ) : null}
      </div>
    </div>
  );
}
