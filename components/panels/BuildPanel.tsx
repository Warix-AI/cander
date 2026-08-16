"use client";

import { useApp } from "@/components/app/AppProvider";
import { Row, SectionLabel, StatLine } from "@/components/panels/Bits";
import { SegTabs } from "@/components/ui/Controls";
import {
  canderCode,
  canderFiles,
  projects,
  scheduledJobs,
  starbaseFiles,
} from "@/lib/data";
import type { BuildTool } from "@/lib/types";

const tools: { id: BuildTool; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "chats", label: "Chats" },
  { id: "files", label: "Files" },
  { id: "editor", label: "Code" },
  { id: "preview", label: "Preview" },
  { id: "terminal", label: "Terminal" },
  { id: "git", label: "Git" },
  { id: "deployments", label: "Deploy" },
  { id: "database", label: "Database" },
  { id: "logs", label: "Logs" },
  { id: "env", label: "Env" },
  { id: "activity", label: "Activity" },
  { id: "design", label: "Design" },
];

export function BuildPanel() {
  const {
    workspaceId,
    project,
    panelIntent,
    buildTool,
    setBuildTool,
    openProject,
    threads,
  } = useApp();

  const list = projects.filter(
    (item) => item.space === "build" && item.workspaceId === workspaceId,
  );
  const execute = panelIntent === "execute";

  if ((!project || project.space !== "build") && !execute) {
    return (
      <div className="p-3 pt-4">
        <SectionLabel>Projects</SectionLabel>
        {list.length ? (
          list.map((item) => (
            <Row
              key={item.id}
              title={item.name}
              meta={item.updatedAt}
              onClick={() => openProject(item.id)}
            />
          ))
        ) : (
          <p className="px-3 py-6 text-[13px] leading-relaxed text-muted-foreground">
            No Build projects in this workspace. Ask chat to start one.
          </p>
        )}
      </div>
    );
  }

  const files = project?.id === "starbase" ? starbaseFiles : canderFiles;
  const tool = execute && (buildTool === "overview" || !project)
    ? "preview"
    : buildTool;

  return (
    <div className="flex h-full min-h-[28rem] flex-col">
      <div className="border-b border-border px-3 py-2">
        <SegTabs
          items={tools}
          value={tool}
          onChange={(id) => setBuildTool(id as BuildTool)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tool === "overview" ? (
          <div className="py-2">
            <StatLine label="Status" value="Preview ready" />
            <StatLine label="Git" value="main · 3 files" />
            <StatLine label="Last deploy" value="Yesterday 18:12" />
            <div className="mt-3">
              <SectionLabel>In this project</SectionLabel>
              <Row title={project?.summary ?? "A new Build chat. Preview opens as soon as Courier has files."} meta="" />
              {scheduledJobs
                .filter((job) => project && job.projectId === project.id)
                .map((job) => (
                  <Row key={job.id} title={job.name} meta={job.schedule} />
                ))}
            </div>
          </div>
        ) : null}

        {tool === "chats" ? (
          <div className="py-2">
            {threads
              .filter((thread) => project && thread.projectId === project.id)
              .map((thread) => (
                <Row
                  key={thread.id}
                  title={thread.title}
                  meta={thread.updatedAt}
                />
              ))}
          </div>
        ) : null}

        {tool === "files" ? (
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

        {tool === "editor" ? (
          <pre className="h-full overflow-auto p-4 font-mono text-[12px] leading-relaxed text-muted-foreground">
            {canderCode}
          </pre>
        ) : null}

        {tool === "preview" ? (
          <div className="p-4">
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="border-b border-border px-3 py-2 font-mono text-[11px] text-muted-foreground">
                localhost:4100
              </div>
              <div className="bg-background px-8 py-12">
                <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
                  Courier
                </p>
                <p className="heading-display mt-3 text-[2rem] tracking-[-0.04em]">
                  {project?.name ?? "New preview"}
                </p>
                <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                  {project
                    ? "A quiet landing mock. Chat can rewrite copy, then this preview updates in place."
                    : "Keep typing. Courier will stand up a preview as soon as this chat has a project."}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {tool === "terminal" ? (
          <pre className="p-4 font-mono text-[12px] leading-relaxed text-muted-foreground">
            {`$ npm run dev
▲ Next.js 16
- Local: http://localhost:4100
✓ Ready in 812ms`}
          </pre>
        ) : null}

        {tool === "git" ? (
          <div className="py-2">
            <StatLine label="Branch" value="main" />
            <Row title="components/Pricing.tsx" meta="M" />
            <Row title="app/pricing/page.tsx" meta="M" />
            <Row title="PR · Pricing copy pass" meta="Open" />
          </div>
        ) : null}

        {tool === "deployments" ? (
          <div className="py-2">
            <Row title="Production · cander.acme.com" meta="Live" />
            <Row title="Preview · 18f2" meta="2h ago" />
          </div>
        ) : null}

        {tool === "database" ? (
          <div className="py-2">
            <Row title="leads" meta="12,481 rows" />
            <Row title="plans" meta="3 rows" />
          </div>
        ) : null}

        {tool === "logs" ? (
          <pre className="p-4 font-mono text-[12px] text-muted-foreground">
            {`14:02:11  GET /  200  18ms
14:02:12  GET /pricing  200  22ms`}
          </pre>
        ) : null}

        {tool === "env" ? (
          <div className="py-2">
            <Row title="COURIER_API_URL" meta="••••" />
            <Row title="STRIPE_KEY" meta="••••" />
          </div>
        ) : null}

        {tool === "activity" ? (
          <div className="py-2">
            <Row title="Preview refreshed" meta="2h ago" />
            <Row title="Pricing.tsx edited" meta="2h ago" />
          </div>
        ) : null}

        {tool === "design" ? (
          <div className="p-4">
            <div className="flex aspect-video items-end rounded-lg border border-border bg-muted p-4">
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
