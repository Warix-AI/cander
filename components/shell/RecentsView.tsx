"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { DashFrame, ScopeToggle } from "@/components/spaces/ItemSet";
import {
  PreviewGrid,
  type PreviewEntry,
  type PreviewKind,
} from "@/components/spaces/PreviewCard";
import { researchPaperPreviews } from "@/lib/data";
import {
  openIndexEntry,
  useSpaceIndex,
} from "@/lib/hooks/use-space-index";
import { QueryError, QuerySkeleton } from "@/lib/hooks/space-query-ui";
import { MobileFilterBar } from "@/components/shell/mobile/MobilePanelActions";
import { useMobileShell } from "@/lib/use-media-query";

export function RecentsView() {
  const { openThread, openProject, openSpaceEntity, newChat } = useApp();
  const mobile = useMobileShell();
  const [scope, setScope] = useState<string>("all");

  const scopeOptions = [
    { id: "all", label: "All" },
    { id: "new", label: "New" },
    { id: "connectors", label: "Connectors" },
    { id: "search", label: "Search" },
    { id: "image", label: "Image" },
    { id: "app", label: "App" },
    { id: "website", label: "Website" },
  ];

  const { entries, loading, error } = useSpaceIndex({
    space: "all",
  });

  const scopedEntries = useMemo(() => {
    if (scope === "all") return entries;
    return entries.filter((entry) => {
      if (scope === "new") return entry.kind === "thread" && !entry.linkedProjectId;
      if (scope === "connectors") return entry.kind === "briefing";
      if (scope === "search") return entry.space === "research";
      if (scope === "image") return entry.space === "studio";
      if (scope === "app") return entry.projectKind === "app";
      if (scope === "website") return entry.projectKind === "site";
      return true;
    });
  }, [entries, scope]);

  const items = useMemo(() => {
    return scopedEntries.map((entry): PreviewEntry & { openKey: string } => {
      const research =
        entry.space === "research"
          ? researchPaperPreviews[entry.entityId]
          : undefined;
      const kind: PreviewKind =
        entry.kind === "source" || research ? "paper" : "product";
      return {
        id: entry.key,
        openKey: entry.key,
        name: entry.title,
        projectId:
          entry.kind === "project"
            ? entry.entityId
            : (entry.linkedProjectId ?? entry.entityId),
        threadId: entry.kind === "thread" ? entry.entityId : undefined,
        linkedProjectId: entry.linkedProjectId,
        indexKind: entry.kind,
        meta: entry.meta,
        badge: entry.badge,
        image: entry.cover,
        kind,
        paperPreview: research ?? {
          title: entry.title,
          lines: entry.snippet ? [entry.snippet] : [],
        },
        bannerKey: entry.space,
      };
    });
  }, [scopedEntries]);

  const open = (key: string) => {
    const entry = scopedEntries.find((item) => item.key === key);
    if (!entry) return;
    openIndexEntry(entry, { openThread, openProject, openSpaceEntity });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashFrame
        banner={false}
        title="Recents"
        subtitle="Chats and work from every Space, newest first."
      >
        <MobileFilterBar
          active={mobile}
          onNewChat={() => newChat()}
          newChatLabel="New chat"
          scope={{ value: scope, onChange: setScope, options: scopeOptions }}
        >
          <ScopeToggle
            wrap
            value={scope}
            onChange={setScope}
            options={scopeOptions}
          />
        </MobileFilterBar>
        <div className="mt-5">
          {loading && items.length === 0 ? (
            <QuerySkeleton rows={4} />
          ) : error && items.length === 0 ? (
            <QueryError message={error} />
          ) : (
            <PreviewGrid
              layout="list"
              items={items}
              onOpen={open}
              empty="Nothing recent in this workspace yet."
            />
          )}
        </div>
      </DashFrame>
    </div>
  );
}
