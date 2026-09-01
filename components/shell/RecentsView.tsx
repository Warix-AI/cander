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
import { CHAT_SPACES } from "@/lib/spaces";
import { QueryError, QuerySkeleton } from "@/lib/hooks/space-query-ui";
import { navLabel } from "@/lib/use-main-nav-items";
import type { SpaceId } from "@/lib/types";
import { MobileFilterBar } from "@/components/shell/mobile/MobilePanelActions";
import { useMobileShell } from "@/lib/use-media-query";

export function RecentsView() {
  const { openThread, openProject, openSpaceEntity, newChat } = useApp();
  const mobile = useMobileShell();
  const [scope, setScope] = useState<string>("all");

  const scopeOptions = [
    { id: "all", label: "All" },
    ...CHAT_SPACES.map((id) => ({
      id,
      label: navLabel(id as SpaceId) ?? id,
    })),
  ];

  const { entries, loading, error } = useSpaceIndex({
    space: scope === "all" ? "all" : (scope as SpaceId),
  });

  const items = useMemo(() => {
    return entries.map((entry): PreviewEntry & { openKey: string } => {
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
        projectId: entry.key,
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
  }, [entries]);

  const open = (key: string) => {
    const entry = entries.find((item) => item.key === key);
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
