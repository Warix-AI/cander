"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashFrame,
  DashBtn,
  LayoutToggle,
  ScopeToggle,
  SpaceSettingsButton,
} from "@/components/spaces/ItemSet";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import { researchPaperPreviews } from "@/lib/data";
import { editedMeta } from "@/lib/format-relative-time";
import {
  useSpaceProjects,
  useSpaceSources,
} from "@/lib/hooks/use-space-query";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
import type { SpaceProject } from "@/lib/space-entities";
import { MobileFilterBar } from "@/components/shell/mobile/MobilePanelActions";
import { useMobileShell } from "@/lib/use-media-query";

type ExploreScope = "all" | "projects" | "research" | "reports" | "sources";

const exploreScopeOptions = [
  { id: "all", label: "All" },
  { id: "projects", label: "Projects" },
  { id: "research", label: "Research" },
  { id: "reports", label: "Reports" },
  { id: "sources", label: "Sources" },
] as const;

function exploreKind(project: SpaceProject): "research" | "reports" | "sources" {
  if (project.kind === "research") return "research";
  if (project.threadId) return "research";
  return "reports";
}

export function ResearchDashboard() {
  const {
    openProject,
    openBrowser: openBrowserView,
    spaceLayout,
    setSpaceLayout,
    newChat,
    mobileSurface,
    view,
  } = useApp();
  const mobile = useMobileShell();
  const hoistFilters =
    mobile && view === "space" && mobileSurface === "panel";
  const [scope, setScope] = useState<ExploreScope>("all");

  const { data: spaceProjects, loading: projectsLoading } =
    useSpaceProjects("research");
  const { data: sources, loading: sourcesLoading } = useSpaceSources({
    space: "research",
  });

  const sourceCards = useMemo(
    () =>
      sources.map((source) => ({
        id: source.id,
        name: source.title,
        projectId: source.id,
        meta: `Source · ${source.url?.replace(/^https?:\/\//, "") ?? "saved"}`,
        bannerKey: "research" as const,
      })),
    [sources],
  );

  const visible = useMemo(() => {
    if (scope === "sources") return sourceCards;
    if (scope === "all" || scope === "projects") return spaceProjects;
    return spaceProjects.filter((item) => exploreKind(item) === scope);
  }, [scope, spaceProjects, sourceCards]);

  const loading =
    scope === "sources"
      ? sourcesLoading
      : projectsLoading;

  return (
    <DashFrame
      space="research"
      title="Explore"
      subtitle="Research, browse, analyze, and discover."
      actions={
        <>
          <DashBtn primary onClick={() => openBrowserView()}>
            Browse
          </DashBtn>
          <DashBtn onClick={() => newChat("research")}>Ask</DashBtn>
          <SpaceSettingsButton space="research" />
        </>
      }
    >
      <MobileFilterBar
        active={hoistFilters}
        onNewChat={() => newChat("research")}
        scope={{
          value: scope,
          onChange: (value) => setScope(value as ExploreScope),
          options: [...exploreScopeOptions],
        }}
        layout={{ value: spaceLayout, onChange: setSpaceLayout }}
      >
        <ScopeToggle
          wrap
          value={scope}
          onChange={(value) => setScope(value as ExploreScope)}
          options={[...exploreScopeOptions]}
        />
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </MobileFilterBar>

      <div className="mt-5">
        {loading ? (
          <QuerySkeleton rows={2} />
        ) : scope === "sources" ? (
          <PreviewGrid
            layout={spaceLayout}
            kind="file"
            items={sourceCards}
            onOpen={() => openBrowserView()}
            empty="No sources yet. Browse the web and save pages."
          />
        ) : (
          <>
            {!spaceProjects.length && scope !== "projects" ? (
              <ExploreScopeOverview scope={scope} />
            ) : null}
            <PreviewGrid
            layout={spaceLayout}
            kind={scope === "projects" ? "product" : "paper"}
            items={(visible as SpaceProject[]).map((item) => ({
              id: item.id,
              name: item.title,
              projectId: item.id,
              meta:
                scope === "projects"
                  ? editedMeta(item.updatedAt)
                  : `${exploreKind(item) === "research" ? "Research" : "Report"} · ${editedMeta(item.updatedAt)}`,
              image: scope === "projects" ? item.cover : undefined,
              bannerKey: scope === "projects" ? undefined : ("research" as const),
              paperPreview:
                scope === "projects"
                  ? undefined
                  : researchPaperPreviews[item.id] ?? {
                      title: item.title,
                      lines: [item.summary],
                    },
            }))}
            onOpen={openProject}
            empty={
              scope === "projects"
                ? "No projects yet. Create one to start researching."
                : "Nothing in Explore yet. Create a project or save a source."
            }
          />
          </>
        )}
      </div>
    </DashFrame>
  );
}

function ExploreScopeOverview({ scope }: { scope: ExploreScope }) {
  const lanes =
    scope === "research"
      ? ["Research notes", "Open questions", "Reading list"]
      : scope === "reports"
        ? ["Reports", "Summaries", "Findings"]
        : ["Sources", "Notes", "Reports"];
  return (
    <div className="mb-4 grid gap-2">
      {lanes.map((lane) => (
        <div
          key={lane}
          className="rounded-[10px] border border-border bg-muted/30 px-4 py-3.5"
        >
          <p className="text-[14px] font-medium tracking-[-0.02em]">{lane}</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Save what you find as you explore
          </p>
        </div>
      ))}
    </div>
  );
}
