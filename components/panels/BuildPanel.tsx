"use client";

import { useMemo } from "react";
import { useApp } from "@/components/app/AppProvider";
import { Row, SectionLabel, StatLine } from "@/components/panels/Bits";
import { SpaceLibraryPanel } from "@/components/panels/SpaceLibraryPanel";
import { BuildMore } from "@/components/panels/BuildMore";
import { PreviewChrome, previewAddress } from "@/components/panels/PreviewChrome";
import { AppViewport } from "@/components/preview/AppViewport";
import { ChangeTimeline } from "@/components/preview/ChangeTimeline";
import { canderCode, canderFiles, scheduledJobs, starbaseFiles } from "@/lib/data";
import { threadsForProject } from "@/lib/selectors";
import type { BuildTool } from "@/lib/types";
import { SHELL_PANEL_BODY, SHELL_PANEL_SCROLL } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

const ADVANCED_TOOLS: BuildTool[] = [
  "files",
  "editor",
  "terminal",
  "git",
  "logs",
  "env",
  "database",
  "dependencies",
];

export function BuildPanel() {
  const {
    project,
    panelIntent,
    buildTool,
    setBuildTool,
    threads,
    advancedMode,
    setAdvancedMode,
    liveUrl,
  } = useApp();
  const execute = panelIntent === "execute";
  const projectThreads = useMemo(
    () =>
      project
        ? threadsForProject(threads, {
            projectId: project.id,
            workspaceId: project.workspaceId,
          })
        : [],
    [project, threads],
  );

  if ((!project || project.space !== "build") && !execute) {
    return <SpaceLibraryPanel />;
  }

  const files = project?.id === "starbase" ? starbaseFiles : canderFiles;
  const tool: BuildTool =
    execute && buildTool === "overview" && !project ? "preview" : buildTool;
  const address = previewAddress(project?.name);
  const locked = ADVANCED_TOOLS.includes(tool) && !advancedMode;

  return (
    <div className={SHELL_PANEL_BODY}>
      <PreviewChrome
        tool={tool}
        onTool={(id) => setBuildTool(id)}
        title={address.tab}
        url={liveUrl ?? address.url}
      />
      <div
        className={cn(
          SHELL_PANEL_SCROLL,
          (tool === "preview" || tool === "more") && !locked
            ? "overflow-hidden"
            : undefined,
        )}
      >
        {locked ? (
          <div className="p-6">
            <p className="text-[14px] font-medium tracking-[-0.02em]">
              Advanced tools
            </p>
            <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
              Files, Terminal, Git, and environment variables stay out of the way until you want them.
            </p>
            <button
              type="button"
              onClick={() => setAdvancedMode(true)}
              className="mt-4 inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:bg-foreground"
            >
              Show advanced tools
            </button>
          </div>
        ) : null}

        {!locked && tool === "overview" ? (
          <div className="py-2">
            <StatLine label="Status" value="Preview ready" />
            <StatLine label="Last publish" value={liveUrl ? "Live" : "Not published"} />
            <div className="mt-3">
              <SectionLabel>In this project</SectionLabel>
              <Row
                title={
                  project?.summary ??
                  "A new Build chat. Preview opens as soon as there's something to show."
                }
                meta=""
              />
              {scheduledJobs
                .filter((job) => project && job.projectId === project.id)
                .map((job) => (
                  <Row key={job.id} title={job.name} meta={job.schedule} />
                ))}
            </div>
          </div>
        ) : null}

        {!locked && tool === "chats" ? (
          <div className="py-2">
            {projectThreads.map((thread) => (
              <Row
                key={thread.id}
                title={thread.title}
                meta={thread.updatedAt}
              />
            ))}
          </div>
        ) : null}

        {!locked && tool === "files" ? (
          <div className="py-2 font-mono text-[12px]">
            {files.map((file) => (
              <Row
                key={file.path}
                title={file.path}
                active={"active" in file && file.active}
              />
            ))}
          </div>
        ) : null}

        {!locked && tool === "editor" ? (
          <pre className="h-full overflow-auto p-4 font-mono text-[12px] leading-relaxed text-muted-foreground">
            {canderCode}
          </pre>
        ) : null}

        {!locked && tool === "preview" ? (
          <div className="h-full min-h-0">
            <AppViewport
              name={project?.name ?? "New preview"}
              summary={
                project
                  ? "Click anything to select it, then tell chat what to change."
                  : "Keep typing. A preview will stand up as soon as this chat has a project."
              }
            />
          </div>
        ) : null}

        {!locked && tool === "more" ? <BuildMore /> : null}

        {!locked && tool === "terminal" ? (
          <pre className="h-full p-4 font-mono text-[12px] leading-relaxed text-muted-foreground">
            {`$ npm run dev
▲ Next.js 16
- Local: ${address.url}
✓ Ready in 812ms`}
          </pre>
        ) : null}

        {!locked && tool === "git" ? (
          <div className="py-2">
            <StatLine label="Branch" value="main" />
            <Row title="components/Pricing.tsx" meta="M" />
            <Row title="app/pricing/page.tsx" meta="M" />
            <Row title="PR · Pricing copy pass" meta="Open" />
          </div>
        ) : null}

        {!locked && tool === "activity" ? <ChangeTimeline /> : null}

        {!locked && tool === "deployments" ? (
          <div className="py-2">
            {liveUrl ? (
              <Row title={liveUrl.replace("https://", "")} meta="Live" />
            ) : (
              <Row title="Not published yet" meta="Use Publish in Preview" />
            )}
            <Row title="Preview · local" meta={address.url} />
          </div>
        ) : null}

        {!locked && tool === "database" ? (
          <div className="py-2">
            <Row title="leads" meta="12,481 rows" />
            <Row title="plans" meta="3 rows" />
          </div>
        ) : null}

        {!locked && tool === "logs" ? (
          <pre className="p-4 font-mono text-[12px] text-muted-foreground">
            {`14:02:11  GET /  200  18ms
14:02:12  GET /pricing  200  22ms`}
          </pre>
        ) : null}

        {!locked && tool === "env" ? (
          <div className="py-2">
            <p className="px-4 pt-2 pb-1 text-[13px] text-muted-foreground">
              Keys stay here — they never appear in chat after you save them.
            </p>
            <Row title="Stripe" meta="•••• saved" />
            <Row title="Keys" meta="•••• saved" />
          </div>
        ) : null}

        {!locked && tool === "dependencies" ? (
          <div className="py-2">
            <Row title="next" meta="16.0.0" />
            <Row title="react" meta="19.1.0" />
            <Row title="typescript" meta="5.8.0" />
          </div>
        ) : null}

        {!locked && tool === "design" ? (
          <div className="p-4">
            <div className="flex aspect-video items-end rounded-[10px] border border-border bg-muted p-4">
              <p className="text-[13px] text-muted-foreground">
                Component preview · Hero
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
