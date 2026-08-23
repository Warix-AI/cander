"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  DataList,
  DataRow,
  EmptyHint,
  PanelToolbar,
  Section,
  StatusPill,
} from "@/components/platform/DevChrome";
import { PlatformAskButton } from "@/components/platform/PlatformChatDock";
import {
  DashBtn,
  DashFrame,
  LayoutToggle,
  ScopeToggle,
} from "@/components/spaces/ItemSet";
import {
  PreviewGrid,
  type PreviewEntry,
  type PreviewKind,
} from "@/components/spaces/PreviewCard";
import {
  buildPreviews,
  platformNavItems,
  projects,
  researchPaperPreviews,
  spaces,
} from "@/lib/data";
import { inferPlatformIntent } from "@/lib/platform-intent";
import { PRIMARY_NAV_SPACES } from "@/lib/spaces";
import type { PlatformNav, SpaceId, Thread } from "@/lib/types";

function recencyRank(updatedAt: string) {
  const text = updatedAt.toLowerCase();
  if (text.includes("just now")) return 0;
  if (text.includes("this morning")) return 1;
  const hours = text.match(/(\d+)\s*h/);
  if (hours) return 10 + Number(hours[1]);
  if (text.includes("yesterday")) return 40;
  const days = text.match(/(\d+)\s*d/);
  if (days) return 50 + Number(days[1]);
  const weeks = text.match(/(\d+)\s*w/);
  if (weeks) return 80 + Number(weeks[1]) * 7;
  return 100;
}

function projectImage(projectId?: string) {
  if (!projectId) return undefined;
  const project = projects.find((item) => item.id === projectId);
  if (project?.cover) return project.cover;
  return buildPreviews.find((item) => item.projectId === projectId)?.image;
}

const platformFilters = platformNavItems.filter((item) => item.id !== "recents");

function platformSurface(thread: Thread): PlatformNav | undefined {
  if (thread.platformNav && thread.platformNav !== "recents") {
    return thread.platformNav;
  }
  const first = thread.messages.find((item) => item.role === "user");
  const nav = first ? inferPlatformIntent(first.content).nav : undefined;
  return nav === "recents" ? undefined : nav;
}

export function RecentsView() {
  const { product } = useApp();
  if (product === "platform") return <PlatformRecents />;
  return <CourierRecents />;
}

function PlatformRecents() {
  const { workspaceId, threads, openThread, entitlements } = useApp();
  const [scope, setScope] = useState("all");
  const filters = platformFilters.filter((item) =>
    entitlements.platformNavAllowed(item.id),
  );

  const items = useMemo(() => {
    return threads
      .filter(
        (thread) =>
          thread.product === "platform" && thread.workspaceId === workspaceId,
      )
      .map((thread) => ({
        thread,
        surface: platformSurface(thread),
        rank: recencyRank(thread.updatedAt),
      }))
      .sort((a, b) => a.rank - b.rank);
  }, [threads, workspaceId]);

  const visible =
    scope === "all"
      ? items
      : items.filter((item) => item.surface === scope);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashFrame
        banner={false}
        title="Recents"
        subtitle="Recent development chats in this workspace, newest first."
        actions={<PlatformAskButton />}
      >
        <PanelToolbar>
          <ScopeToggle
            wrap
            value={scope}
            onChange={setScope}
            options={[
              { id: "all", label: "All" },
              ...filters.map((item) => ({
                id: item.id,
                label: item.label,
              })),
            ]}
          />
        </PanelToolbar>

        <div className="mt-6">
          <Section
            title="Chats"
            description="Newest first · filtered by surface when selected."
          >
            {visible.length ? (
              <DataList>
                {visible.map(({ thread, surface }) => {
                  const label =
                    platformFilters.find((item) => item.id === surface)
                      ?.label ?? "Chat";
                  return (
                    <DataRow
                      key={thread.id}
                      onClick={() => openThread(thread.id)}
                      label={
                        <span className="flex flex-wrap items-center gap-2">
                          {thread.title}
                          <StatusPill tone="outline">{label}</StatusPill>
                        </span>
                      }
                      meta={thread.snippet || undefined}
                      value={thread.updatedAt}
                    />
                  );
                })}
              </DataList>
            ) : (
              <EmptyHint>
                No platform chats
                {scope === "all" ? " yet." : " in this filter."}
              </EmptyHint>
            )}
          </Section>
        </div>
      </DashFrame>
    </div>
  );
}

function CourierRecents() {
  const {
    workspaceId,
    threads,
    openThread,
    openProject,
    newChat,
    spaceLayout,
    setSpaceLayout,
  } = useApp();
  const [scope, setScope] = useState("all");

  const items = useMemo(() => {
    const productThreads = threads.filter((thread) => {
      const threadProduct = thread.product ?? "courier";
      return thread.workspaceId === workspaceId && threadProduct === "courier";
    });

    const entries: (PreviewEntry & { rank: number; space?: SpaceId })[] = [];
    const usedProjects = new Set<string>();

    for (const thread of productThreads) {
      if (thread.projectId) usedProjects.add(thread.projectId);
      const project = projects.find((item) => item.id === thread.projectId);
      const spaceLabel = spaces.find((item) => item.id === thread.spaceId)?.label;
      const research =
        thread.spaceId === "research"
          ? researchPaperPreviews[thread.projectId ?? thread.id]
          : undefined;
      const kind: PreviewKind = research ? "paper" : "product";

      entries.push({
        id: `t-${thread.id}`,
        name: thread.title,
        projectId: `t:${thread.id}`,
        meta: [spaceLabel, "Chat", thread.updatedAt].filter(Boolean).join(" · "),
        badge: "Chat",
        image: projectImage(thread.projectId),
        kind,
        paperPreview: research ?? {
          title: thread.title,
          lines: thread.snippet ? [thread.snippet] : [],
        },
        bannerKey: thread.spaceId ?? undefined,
        rank: recencyRank(thread.updatedAt),
        space: thread.spaceId,
      });
    }

    for (const project of projects.filter(
      (item) => item.workspaceId === workspaceId && !usedProjects.has(item.id),
    )) {
      const spaceLabel = spaces.find((item) => item.id === project.space)?.label;
      const research =
        project.space === "research"
          ? researchPaperPreviews[project.id]
          : undefined;
      entries.push({
        id: `p-${project.id}`,
        name: project.name,
        projectId: `p:${project.id}`,
        meta: [spaceLabel, "Project", project.updatedAt]
          .filter(Boolean)
          .join(" · "),
        badge: spaceLabel,
        image: projectImage(project.id),
        kind: research ? "paper" : "product",
        paperPreview: research ?? {
          title: project.name,
          lines: [project.summary],
        },
        bannerKey: project.space,
        rank: recencyRank(project.updatedAt),
        space: project.space,
      });
    }

    return entries.sort((a, b) => a.rank - b.rank);
  }, [threads, workspaceId]);

  const visible =
    scope === "all" ? items : items.filter((item) => item.space === scope);

  const open = (id: string) => {
    if (id.startsWith("t:")) openThread(id.slice(2));
    else openProject(id.slice(2));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashFrame
        banner={false}
        title="Recents"
        subtitle="Chats and work from every Space, newest first."
        actions={
          <DashBtn primary onClick={() => newChat()}>
            New chat
          </DashBtn>
        }
      >
        <div className="flex flex-col gap-3 @min-[420px]:flex-row @min-[420px]:flex-wrap @min-[420px]:items-center @min-[420px]:justify-between">
          <ScopeToggle
            wrap
            value={scope}
            onChange={setScope}
            options={[
              { id: "all", label: "All" },
              ...PRIMARY_NAV_SPACES.map((id) => ({
                id,
                label: spaces.find((item) => item.id === id)?.label ?? id,
              })),
            ]}
          />
          <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
        </div>
        <div className="mt-5">
          <PreviewGrid
            layout={spaceLayout}
            items={visible}
            onOpen={open}
            empty="Nothing recent in this workspace yet."
          />
        </div>
      </DashFrame>
    </div>
  );
}
