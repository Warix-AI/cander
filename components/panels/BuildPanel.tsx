"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { Row, SectionLabel, StatLine } from "@/components/panels/Bits";
import { SpaceLibraryPanel } from "@/components/panels/SpaceLibraryPanel";
import { PreviewChrome, previewAddress } from "@/components/panels/PreviewChrome";
import { AppViewport } from "@/components/preview/AppViewport";
import { ChangeTimeline } from "@/components/preview/ChangeTimeline";
import { scheduledJobs } from "@/lib/data";
import { useSpaceApi, useWorkspaceCtx } from "@/components/app/SpaceDataProvider";
import {
  useProjectDeployments,
  useSpaceProject,
} from "@/lib/hooks/use-space-query";
import { QuerySkeleton } from "@/lib/hooks/space-query-ui";
import { useWebsiteSetupBrief } from "@/lib/hooks/use-website-setup-brief";
import { useBuildJob } from "@/lib/hooks/use-build-job";
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
    projectId,
    panelIntent,
    buildTool,
    setBuildTool,
    threads,
    advancedMode,
    setAdvancedMode,
    liveUrl,
    refreshPreview,
  } = useApp();
  const ctx = useWorkspaceCtx();
  const api = useSpaceApi();
  const execute = panelIntent === "execute";
  const { project: entityProject } = useSpaceProject(projectId);
  const { data: deployments, loading: deploymentsLoading } =
    useProjectDeployments(projectId);
  const [files, setFiles] = useState<{ path: string; label?: string }[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [envStatus, setEnvStatus] = useState<
    import("@/lib/build/sandbox/constants").BuildSandboxStatus | null
  >(null);
  const [envMessage, setEnvMessage] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [draftMeta, setDraftMeta] = useState<{
    branch: string | null;
    sha: string | null;
    fullName: string | null;
  }>({ branch: null, sha: null, fullName: null });

  const entityKind = entityProject?.kind ?? null;
  const {
    brief: websiteBrief,
    setupBlocksPreview,
    showSetupOverlay,
    refresh: refreshWebsiteBrief,
  } = useWebsiteSetupBrief({
    projectId,
    workspaceId: ctx.workspaceId,
    kind: entityKind,
  });
  // Website Builder V2: live progress from the sandbox builder job.
  const buildJob = useBuildJob({
    projectId,
    workspaceId: ctx.workspaceId,
    enabled: entityKind === "site",
  });

  const ensureSandbox = (forceRestart = false) => {
    if (!projectId || !ctx.workspaceId) return;
    if (setupBlocksPreview) return;
    setEnvStatus("starting");
    setEnvMessage(null);
    void import("@/lib/api/project-sandbox-client").then(async (m) => {
      const result = await m.ensureProjectSandboxClient({
        projectId,
        workspaceId: ctx.workspaceId,
        forceRestart,
      });
      if (!result) {
        setEnvStatus("unavailable");
        setEnvMessage("Sign in required to start the build environment.");
        setPreviewSrc(null);
        return;
      }
      setEnvStatus(result.status);
      setEnvMessage(result.message ?? result.error ?? null);
      setDraftMeta({
        branch: result.draftBranch,
        sha: result.draftSha,
        fullName: result.githubFullName,
      });
      if (result.subdomain) {
        setPreviewUrl(`https://draft--${result.subdomain}.cander.app`);
      }
      if (
        result.status === "ready" &&
        result.hasPreviewUpstream &&
        result.previewPath
      ) {
        setPreviewSrc(`${result.previewPath}?_r=${Date.now()}`);
      } else {
        setPreviewSrc(null);
      }
    });
  };

  const retryFinalization = () => {
    if (!projectId || !ctx.workspaceId) return;
    setEnvStatus("starting");
    setEnvMessage(null);
    void (async () => {
      try {
        const { requestBuildReadyClient } = await import(
          "@/lib/api/build-ready-client"
        );
        const finalized = await requestBuildReadyClient({
          projectId,
          workspaceId: ctx.workspaceId,
        });
        await refreshWebsiteBrief();
        if (finalized?.ok) {
          window.dispatchEvent(
            new CustomEvent("cander:website-setup-ready", {
              detail: { projectId },
            }),
          );
          ensureSandbox(true);
          return;
        }
        setEnvStatus("error");
        setEnvMessage(
          [
            finalized?.reason ||
              finalized?.error ||
              "Preview finalization failed.",
            finalized?.diagnostics,
          ]
            .filter(Boolean)
            .join("\n"),
        );
        ensureSandbox(true);
      } catch (err) {
        setEnvStatus("error");
        setEnvMessage(err instanceof Error ? err.message : "Retry failed");
      }
    })();
  };

  // Behind the existing Build open flow: ensure Warix repo + sandbox (idempotent).
  // Skip sandbox while guided website setup is incomplete / building.
  useEffect(() => {
    if (!projectId || !ctx.workspaceId) return;
    if (setupBlocksPreview) {
      setEnvStatus(null);
      setPreviewSrc(null);
      return;
    }
    void import("@/lib/api/project-infra-client").then((m) =>
      m.ensureProjectInfraClient({
        projectId,
        workspaceId: ctx.workspaceId,
      }),
    );
    ensureSandbox(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once per project / setup gate
  }, [projectId, ctx.workspaceId, setupBlocksPreview]);

  // Instant unlock after guided website build completes.
  useEffect(() => {
    if (!projectId || !ctx.workspaceId) return;
    const onReload = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as
        | { projectId?: string }
        | undefined;
      if (detail?.projectId && detail.projectId !== projectId) return;
      ensureSandbox(false);
    };
    window.addEventListener("cander:website-preview-reload", onReload);
    window.addEventListener("cander:website-setup-ready", onReload);
    return () => {
      window.removeEventListener("cander:website-preview-reload", onReload);
      window.removeEventListener("cander:website-setup-ready", onReload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, ctx.workspaceId]);

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

  useEffect(() => {
    if (!projectId) {
      setFiles([]);
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    setFilesLoading(true);
    Promise.all([
      api.build.listProjectFiles(ctx, projectId),
      api.build.startPreview(ctx, projectId),
    ])
      .then(([fileList, session]) => {
        if (cancelled) return;
        setFiles(fileList);
        setPreviewUrl(session.url);
      })
      .finally(() => {
        if (!cancelled) setFilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api.build, ctx, projectId]);

  if ((!project || project.space !== "build") && !execute) {
    return <SpaceLibraryPanel />;
  }

  const displayName = entityProject?.title ?? project?.name ?? "New preview";
  const tool: BuildTool =
    execute && buildTool === "overview" && !project ? "preview" : buildTool;
  const address = previewAddress(displayName);
  const locked = ADVANCED_TOOLS.includes(tool) && !advancedMode;
  // Draft/sandbox hosts stay out of the address chrome until publish.
  const publishedUrl = entityProject?.publishedUrl?.trim() || null;
  const chromeTitle = publishedUrl
    ? `${displayName} · published`
    : `${displayName} · draft`;

  return (
    <div className={SHELL_PANEL_BODY}>
      <PreviewChrome
        tool={tool}
        onTool={(id) => setBuildTool(id)}
        title={chromeTitle}
      />
      <div
        className={cn(
          SHELL_PANEL_SCROLL,
          (tool === "preview") && !locked
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
            <StatLine
              label="Draft"
              value={
                entityProject?.status === "published"
                  ? "Active (published copy live)"
                  : "Active"
              }
            />
            <StatLine
              label="Published"
              value={
                entityProject?.status === "published" && publishedUrl
                  ? publishedUrl
                  : "Not published — use Publish when ready"
              }
            />
            <div className="mt-3">
              <SectionLabel>In this project</SectionLabel>
              <Row
                title={
                  entityProject?.summary ??
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
          filesLoading ? (
            <QuerySkeleton rows={4} />
          ) : (
            <div className="py-2 font-mono text-[12px]">
              {files.map((file) => (
                <Row key={file.path} title={file.path} meta={file.label ?? ""} />
              ))}
            </div>
          )
        ) : null}

        {!locked && tool === "editor" ? (
          <pre className="h-full overflow-auto p-4 font-mono text-[12px] leading-relaxed text-muted-foreground">
            {`// ${displayName}\nexport function App() {\n  return <main>Preview</main>;\n}`}
          </pre>
        ) : null}

        {!locked && tool === "preview" ? (
          <div className="h-full min-h-0">
            <AppViewport
              name={displayName}
              summary={
                project
                  ? "Start generating your website in chat."
                  : "Keep typing. A preview will stand up as soon as this chat has a project."
              }
              envStatus={envStatus}
              envMessage={envMessage}
              onRetryEnv={
                showSetupOverlay && websiteBrief?.status === "failed"
                  ? retryFinalization
                  : () => ensureSandbox(true)
              }
              previewSrc={previewSrc}
              draftPreviewUrl={
                previewUrl && previewUrl.includes("draft--") ? previewUrl : null
              }
              publishedUrl={publishedUrl}
              websiteSetup={
                showSetupOverlay
                  ? {
                      status: websiteBrief?.status ?? "setup",
                      completedSteps: websiteBrief?.completedSteps ?? 0,
                      detail:
                        websiteBrief?.status === "building" && buildJob.latestProgress
                          ? buildJob.latestProgress
                          : websiteBrief?.validationIssues?.[0] || envMessage || null,
                      steps:
                        websiteBrief?.status === "building" && buildJob.isActive
                          ? buildJob.progressLines
                          : null,
                    }
                  : null
              }
              onReloadPreview={() => {
                refreshPreview();
                if (previewSrc) {
                  const base = previewSrc.split("?")[0];
                  setPreviewSrc(`${base}?_r=${Date.now()}`);
                } else {
                  ensureSandbox(false);
                }
              }}
            />
          </div>
        ) : null}

        {!locked && tool === "terminal" ? (
          <pre className="h-full p-4 font-mono text-[12px] leading-relaxed text-muted-foreground">
            {`$ npm run dev
▲ Next.js 16
- Local: ${previewUrl ?? address.url}
✓ Ready in 812ms`}
          </pre>
        ) : null}

        {!locked && tool === "git" ? (
          <div className="py-2">
            <StatLine
              label="Repo"
              value={draftMeta.fullName ?? "Not bound yet"}
            />
            <StatLine
              label="Draft branch"
              value={draftMeta.branch ?? "cander/draft"}
            />
            <StatLine
              label="Tip SHA"
              value={
                draftMeta.sha
                  ? draftMeta.sha.slice(0, 7)
                  : envStatus === "ready"
                    ? "—"
                    : "Waiting for environment"
              }
            />
            <Row
              title="Open Changes for full history"
              meta="Revisions = git SHAs"
            />
          </div>
        ) : null}

        {!locked && tool === "activity" ? <ChangeTimeline /> : null}

        {!locked && tool === "deployments" ? (
          deploymentsLoading ? (
            <QuerySkeleton rows={2} />
          ) : (
            <div className="py-2">
              {deployments.length ? (
                deployments.map((item) => (
                  <Row
                    key={item.id}
                    title={item.url.replace("https://", "")}
                    meta={item.status === "live" ? "Live" : item.status}
                  />
                ))
              ) : (
                <Row title="Not published yet" meta="Use Publish in Preview" />
              )}
              <Row title="Preview · local" meta={previewUrl ?? address.url} />
            </div>
          )
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
            <Row
              title="Supabase"
              meta={
                envMessage?.includes("Supabase")
                  ? "Configured in sandbox"
                  : "Provisioned when auth is needed"
              }
            />
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
